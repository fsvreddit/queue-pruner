import { JobContext, JSONObject, ScheduledJobEvent } from "@devvit/public-api";
import { addSeconds } from "date-fns";
import { uniq } from "lodash";
import { ScheduledJob } from "./constants.js";
import { AppSetting } from "./settings.js";
import { isBanned } from "devvit-helpers";
import { isLinkId } from "@devvit/public-api/types/tid.js";
import pluralize from "pluralize";

const USER_QUEUE_KEY = "userQueue";
const REMOVE_QUEUE = "removeQueue";

async function getPostOrCommentById (itemId: string, context: JobContext) {
    if (isLinkId(itemId)) {
        return context.reddit.getPostById(itemId);
    } else {
        return context.reddit.getCommentById(itemId);
    }
}

async function removeItems (itemIds: string[], lock: boolean, replyComment: string | undefined, context: JobContext) {
    await Promise.all(itemIds.map(item => context.reddit.remove(item, false)));

    if (lock) {
        await Promise.all(itemIds.map(async (itemId) => {
            const item = await getPostOrCommentById(itemId, context);
            await item.lock();
        }));
    }

    if (replyComment && replyComment.trim().length > 0) {
        for (const itemId of itemIds) {
            const newComment = await context.reddit.submitComment({
                id: itemId,
                text: replyComment,
            });
            await newComment.distinguish();
            await newComment.lock();
        }
    }
}

export async function checkQueue (_: unknown, context: JobContext) {
    const modQueue = await context.reddit.getModQueue({
        subreddit: context.subredditName ?? await context.reddit.getCurrentSubredditName(),
        type: "all",
        limit: 1000,
    }).all();

    if (modQueue.length === 0) {
        console.log("Check step: No items in the mod queue.");
        return;
    }

    const settings = await context.settings.getAll();

    if (settings[AppSetting.RemoveDeleted]) {
        // Remove items from deleted users
        const itemsToRemove = modQueue.filter(item => item.authorName === "[deleted]");
        if (itemsToRemove.length > 0) {
            const shouldLock = settings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
            await removeItems(itemsToRemove.map(item => item.id), shouldLock, undefined, context);
            console.log(`Check step: Removed ${itemsToRemove.length} ${pluralize("item", itemsToRemove.length)} from the mod queue due to deleted users.`);
        }
    }

    if (!settings[AppSetting.RemoveShadowbanned] && !settings[AppSetting.RemoveBanned]) {
        return;
    }

    const usersToQueue = uniq(modQueue
        .filter(item => item.authorName !== "[deleted]")
        .map(item => item.authorName));

    const existingQueue = await context.redis.zRange(USER_QUEUE_KEY, 0, -1);
    const existingUsers = new Set(existingQueue.map(user => user.member));
    const newUsers = usersToQueue.filter(user => !existingUsers.has(user));

    if (newUsers.length === 0) {
        console.log("No new users to add to the queue.");
        return;
    }

    await context.redis.zAdd(USER_QUEUE_KEY, ...newUsers.map(user => ({ member: user, score: Date.now() })));
    console.log(`Check step: Added ${newUsers.length} new ${pluralize("user", newUsers.length)} to the queue.`);

    await context.scheduler.runJob({
        name: ScheduledJob.PruneUsers,
        runAt: addSeconds(new Date(), 5),
        data: {
            firstRun: true,
            runRemove: false,
        },
    });
}

async function userIsActive (username: string, context: JobContext): Promise<boolean> {
    try {
        const user = await context.reddit.getUserByUsername(username);
        return user !== undefined;
    } catch {
        // User is shadowbanned or suspended
        return false;
    }
}

export async function pruneUsers (event: ScheduledJobEvent<JSONObject | undefined>, context: JobContext) {
    const runRecentlyKey = "pruneUsersRecentlyRun";
    if (event.data?.firstRun && await context.redis.get(runRecentlyKey)) {
        return;
    }

    let runRemove = event.data?.runRemove ?? false;

    const runLimit = addSeconds(new Date(), 10);
    const queue = await context.redis.zRange(USER_QUEUE_KEY, 0, -1);

    if (queue.length === 0) {
        return;
    }

    await context.redis.set(runRecentlyKey, "", { expiration: addSeconds(new Date(), 30) });

    const settings = await context.settings.getAll();

    let processed = 0;
    const processedUsers: string[] = [];

    while (queue.length > 0 && new Date() < runLimit) {
        const user = queue.shift();
        if (!user) {
            break;
        }

        processedUsers.push(user.member);
        processed++;

        if (settings[AppSetting.RemoveShadowbanned]) {
            const isActive = await userIsActive(user.member, context);

            if (!isActive) {
                console.log(`Prune step: User ${user.member} is shadowbanned/suspended, adding to remove queue.`);
                await context.redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
                runRemove = true;
                continue;
            }
        }

        if (settings[AppSetting.RemoveBanned]) {
            const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();
            if (await isBanned(context.reddit, subredditName, user.member)) {
                console.log(`Prune step: User ${user.member} is banned, adding to remove queue.`);
                await context.redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
                runRemove = true;
                continue;
            }
        }
    }

    await context.redis.zRem(USER_QUEUE_KEY, processedUsers);
    console.log(`Prune step: Processed ${processed} ${pluralize("user", processed)} in the prune job.`);

    if (queue.length > 0) {
        console.log(`Prune step: ${queue.length} ${pluralize("user", queue.length)} left in the queue.`);

        await context.scheduler.runJob({
            name: ScheduledJob.PruneUsers,
            runAt: addSeconds(new Date(), 5),
            data: { runRemove },
        });
    } else if (runRemove) {
        await context.scheduler.runJob({
            name: ScheduledJob.RemoveUsers,
            runAt: addSeconds(new Date(), 5),
        });
        await context.redis.del(runRecentlyKey);
    }
}

export async function removeUsers (_: unknown, context: JobContext) {
    const removeQueue = await context.redis.zRange(REMOVE_QUEUE, 0, -1);

    if (removeQueue.length === 0) {
        return;
    }

    // Retrieve app user - this is a proxy for checking platform stability.
    try {
        await context.reddit.getUserByUsername(context.appName);
    } catch {
        console.error("Remove step: Platform appears to be unstable, aborting remove operation.");
        return;
    }

    const modQueue = await context.reddit.getModQueue({
        subreddit: context.subredditName ?? await context.reddit.getCurrentSubredditName(),
        type: "all",
        limit: 1000,
    }).all();

    const itemsToRemove = modQueue.filter(item => removeQueue.some(user => user.member === item.authorName));
    if (itemsToRemove.length > 0) {
        const settings = await context.settings.getAll();
        const shouldLock = settings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
        const replyComment = settings[AppSetting.ReplyCommentForShadowbanned] as string | undefined;
        await removeItems(itemsToRemove.map(item => item.id), shouldLock, replyComment, context);
        console.log(`Remove step: Removed ${itemsToRemove.length} ${pluralize("item", itemsToRemove.length)} from the mod queue for shadowbanned or suspended users.`);
    } else {
        console.log("Remove step: No items found in the mod queue for users to remove.");
    }

    await context.redis.zRem(REMOVE_QUEUE, removeQueue.map(user => user.member));
}

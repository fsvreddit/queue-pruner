import { JobContext, JSONObject, ScheduledJobEvent } from "@devvit/public-api";
import { CronExpressionParser } from "cron-parser";
import { addSeconds } from "date-fns";
import { uniq } from "lodash";
import { CHECK_QUEUE_CRON, ScheduledJob } from "./constants.js";
import { AppSetting } from "./settings.js";

const USER_QUEUE_KEY = "userQueue";
const REMOVE_QUEUE = "removeQueue";

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
            await Promise.all(itemsToRemove.map(item => context.reddit.remove(item.id, false)));
            console.log(`Check step: Removed ${itemsToRemove.length} item(s) from the mod queue due to deleted users.`);
        }
    }

    if (!settings[AppSetting.RemoveShadowbanned]) {
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
    console.log(`Check step: Added ${newUsers.length} new user(s) to the queue.`);

    await context.scheduler.runJob({
        name: ScheduledJob.PruneUsers,
        runAt: addSeconds(new Date(), 5),
        data: { runRemove: false },
    });
}

export async function userIsActive (username: string, context: JobContext): Promise<boolean> {
    try {
        const user = await context.reddit.getUserByUsername(username);
        return user !== undefined;
    } catch {
        // User is shadowbanned or suspended
        return false;
    }
}

export async function pruneUsers (event: ScheduledJobEvent<JSONObject | undefined>, context: JobContext) {
    let runRemove = event.data?.runRemove ?? false;

    const runLimit = addSeconds(new Date(), 15);
    const queue = await context.redis.zRange(USER_QUEUE_KEY, 0, -1);

    if (queue.length === 0) {
        return;
    }

    let processed = 0;
    const processedUsers: string[] = [];

    while (queue.length > 0 && new Date() < runLimit) {
        const user = queue.shift();
        if (!user) {
            break;
        }

        const isActive = await userIsActive(user.member, context);
        processedUsers.push(user.member);
        processed++;

        if (!isActive) {
            console.log(`Prune step: User ${user.member} is inactive, adding to remove queue.`);
            await context.redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
            runRemove = true;
        }
    }

    await context.redis.zRem(USER_QUEUE_KEY, processedUsers);
    console.log(`Prune step: Processed ${processed} user(s) in the prune job.`);

    const nextRun = CronExpressionParser.parse(CHECK_QUEUE_CRON).next().toDate();
    if (queue.length > 0 && nextRun > addSeconds(new Date(), 45)) {
        console.log(`Prune step: There are still ${queue.length} user(s) left in the queue.`);

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
    }
}

export async function removeUsers (_: unknown, context: JobContext) {
    const removeQueue = await context.redis.zRange(REMOVE_QUEUE, 0, -1);

    if (removeQueue.length === 0) {
        return;
    }

    const modQueue = await context.reddit.getModQueue({
        subreddit: context.subredditName ?? await context.reddit.getCurrentSubredditName(),
        type: "all",
        limit: 1000,
    }).all();

    const itemsToRemove = modQueue.filter(item => removeQueue.some(user => user.member === item.authorName));
    if (itemsToRemove.length > 0) {
        await Promise.all(itemsToRemove.map(item => context.reddit.remove(item.id, false)));
        console.log(`Remove step: Removed ${itemsToRemove.length} item(s) from the mod queue for shadowbanned or suspended users.`);
    } else {
        console.log("Remove step: No items found in the mod queue for users to remove.");
    }

    await context.redis.zRem(REMOVE_QUEUE, removeQueue.map(user => user.member));
}

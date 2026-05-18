import { Comment, JobContext, JSONObject, Post, ScheduledJobEvent } from "@devvit/public-api";
import { addHours, addSeconds } from "date-fns";
import { uniq } from "lodash";
import { ScheduledJob } from "./constants.js";
import { AppSetting } from "./settings.js";
import { expireKeyAt, isBanned } from "devvit-helpers";
import pluralize from "pluralize";
import { getUserActiveStatus, UserActiveStatus } from "./userStatus.js";
import { getPostOrCommentById } from "@fsvreddit/fsv-devvit-helpers";
import { getCachedModeratorList } from "./modChecks.js";

const USER_QUEUE_KEY = "userQueue";
const REMOVE_QUEUE = "removeQueue";

async function removeItems (itemIds: string[], lock: boolean, replyComment: string | undefined, context: JobContext) {
    await Promise.all(itemIds.map(item => context.reddit.remove(item, false)));

    if (lock) {
        await Promise.all(itemIds.map(async (itemId) => {
            const item = await getPostOrCommentById(context.reddit, itemId);
            await item.lock();
        }));
    }

    if (replyComment && replyComment.trim().length > 0) {
        const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();
        const commentToAdd = replyComment + `\n\n*I am a bot, and this action was performed automatically. Please [contact the moderators of this subreddit](https://www.reddit.com/r/${subredditName}/about/moderators) if you have any questions or concerns.*`;

        for (const itemId of itemIds) {
            const newComment = await context.reddit.submitComment({
                id: itemId,
                text: commentToAdd,
            });
            await newComment.distinguish();
            await newComment.lock();
        }
    }
}

export async function checkQueue (_: unknown, context: JobContext) {
    const knownModerators = await getCachedModeratorList(context);

    const modQueue = await context.reddit.getModQueue({
        subreddit: context.subredditName ?? await context.reddit.getCurrentSubredditName(),
        type: "all",
        limit: 1000,
    }).all().then(items => items.filter(item => !knownModerators.has(item.authorName)));

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

    if (settings[AppSetting.RemoveCommentsOnRemovedPosts] || settings[AppSetting.RemoveCommentsOnDeletedPosts]) {
        const postsInQueue = new Set(modQueue.filter(item => item instanceof Post).map(item => item.id));
        const uniquePosts = uniq(modQueue.filter(item => item instanceof Comment).filter(item => !postsInQueue.has(item.postId)).map(item => item.postId));
        const postsToRemoveContentFrom = new Set<string>();

        await Promise.all(uniquePosts.map(async (postId) => {
            const post = await context.reddit.getPostById(postId);

            if (settings[AppSetting.RemoveCommentsOnRemovedPosts]) {
                const categoriesToRemove = ["author", "moderator", "anti_evil_ops", "community_ops", "content_takedown", "copyright_takedown"];
                console.log(post.removedByCategory);
                if (post.removedByCategory && categoriesToRemove.includes(post.removedByCategory)) {
                    postsToRemoveContentFrom.add(postId);
                }
            }

            if (settings[AppSetting.RemoveCommentsOnDeletedPosts] && post.authorName === "[deleted]") {
                postsToRemoveContentFrom.add(postId);
            }
        }));

        if (postsToRemoveContentFrom.size > 0) {
            const shouldLock = settings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
            const itemsToRemove = modQueue.filter(item => item instanceof Comment && postsToRemoveContentFrom.has(item.postId));
            await removeItems(itemsToRemove.map(item => item.id), shouldLock, undefined, context);
            console.log(`Check step: Removed ${itemsToRemove.length} ${pluralize("comment", itemsToRemove.length)} from the mod queue due to removed or deleted posts.`);
        }
    }

    if (!settings[AppSetting.RemoveShadowbanned] && !settings[AppSetting.RemoveBanned]) {
        return;
    }

    const usersInModqueue = uniq(modQueue
        .filter(item => item.authorName !== "[deleted]")
        .map(item => item.authorName));

    const existingCheckQueue = await context.redis.zRange(USER_QUEUE_KEY, 0, -1);
    const existingUsers = new Set(existingCheckQueue.map(user => user.member));
    const newUsers = usersInModqueue.filter(user => !existingUsers.has(user));

    if (newUsers.length > 0) {
        await context.redis.zAdd(USER_QUEUE_KEY, ...newUsers.map(user => ({ member: user, score: Date.now() })));
        console.log(`Check step: Added ${newUsers.length} new ${pluralize("user", newUsers.length)} to the queue.`);
    }

    const totalInQueue = await context.redis.zCard(USER_QUEUE_KEY);
    console.log(`Check step: There ${pluralize("is", totalInQueue)} now ${totalInQueue} ${pluralize("user", totalInQueue)} in the queue.`);

    if (totalInQueue === 0) {
        console.log("Check step: No users in the queue after processing, skipping scheduling prune job.");
        return;
    }

    await context.scheduler.runJob({
        name: ScheduledJob.PruneUsers,
        runAt: addSeconds(new Date(), 5),
        data: {
            firstRun: true,
            runRemove: false,
        },
    });
}

export async function pruneUsers (event: ScheduledJobEvent<JSONObject | undefined>, context: JobContext) {
    const runRecentlyKey = "pruneUsersRecentlyRun";
    if (event.data?.firstRun && await context.redis.get(runRecentlyKey)) {
        return;
    }

    let runRemove = event.data?.runRemove ?? false;

    const runLimit = addSeconds(new Date(), 10);
    const queue = await context.redis.zRange(USER_QUEUE_KEY, 0, Date.now(), { by: "score" });

    if (queue.length === 0) {
        await context.redis.del(runRecentlyKey);
        return;
    }

    await context.redis.set(runRecentlyKey, "", { expiration: addSeconds(new Date(), 30) });

    const settings = await context.settings.getAll();
    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    let processed = 0;
    const usersToRemoveFromQueue = new Set<string>();

    while (queue.length > 0 && new Date() < runLimit) {
        const user = queue.shift();
        if (!user) {
            break;
        }

        processed++;

        if (settings[AppSetting.RemoveShadowbanned]) {
            const userStatus = await getUserActiveStatus(user.member, context);

            const userCheckKey = `userCheck:${user.member}`;
            if (userStatus !== UserActiveStatus.Active) {
                const userCheckCount = await context.redis.incrBy(userCheckKey, 1);
                await expireKeyAt(context.redis, userCheckKey, addHours(new Date(), 1));

                if (userCheckCount > 3) {
                    // We've now had three checks of this user. Now queue for removal.
                    usersToRemoveFromQueue.add(user.member);
                    await context.redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
                    console.log(`Prune step: User ${user.member} has been checked ${userCheckCount} times and is still ${userStatus}, adding to remove queue.`);
                    runRemove = true;
                } else {
                    // Requeue the user for another check later.
                    await context.redis.zAdd(USER_QUEUE_KEY, { member: user.member, score: addSeconds(new Date(), 90).getTime() });
                    console.log(`Prune step: User ${user.member} is ${userStatus}, checked ${userCheckCount} ${pluralize("time", userCheckCount)}, requeuing for another check later (check count: ${userCheckCount}).`);
                }

                continue;
            } else {
                await context.redis.del(userCheckKey);
                usersToRemoveFromQueue.add(user.member);
            }
        }

        if (settings[AppSetting.RemoveBanned]) {
            if (await isBanned(context.reddit, subredditName, user.member)) {
                console.log(`Prune step: User ${user.member} is banned, adding to remove queue.`);
                await context.redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
                runRemove = true;
            }
            usersToRemoveFromQueue.add(user.member);
        }
    }

    await context.redis.zRem(USER_QUEUE_KEY, Array.from(usersToRemoveFromQueue));
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

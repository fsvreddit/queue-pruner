import { Comment, context, reddit, redis, scheduler, settings, TaskRequest } from "@devvit/web/server";
import { isT1, isT3, T1, T3 } from "@devvit/web/shared";
import { addHours, addMinutes, addSeconds } from "date-fns";
import { uniq } from "lodash";
import { AppSetting, getCachedModeratorList, getUserActiveStatus, isBanned, ScheduledJob, UserActiveStatus } from ".";
import pluralize from "pluralize";
import { getPostOrCommentById, hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-web-helpers";
import { PruneUsersJobData, RemoveUsersJobData } from "../tasks";

const USER_QUEUE_KEY = "userQueue";
const REMOVE_QUEUE = "removeQueue";

function getRemovalReasonKeyForUsername (username: string) {
    return `removalReason:${username}`;
}

async function storeRemovalReasonForUsername (username: string, reason: UserActiveStatus) {
    await redis.set(getRemovalReasonKeyForUsername(username), reason, { expiration: addHours(new Date(), 1) });
}

async function getRemovalReasonForUsername (username: string): Promise<UserActiveStatus | undefined> {
    const reason = await redis.get(getRemovalReasonKeyForUsername(username));
    if (!reason) {
        return;
    }

    const activeStatuses = Object.values(UserActiveStatus) as string[];

    if (activeStatuses.includes(reason)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
        return reason as UserActiveStatus;
    }
}

async function removeItems (itemIds: (T1 | T3)[], lock: boolean, replyComment: string | undefined) {
    await Promise.all(itemIds.map(item => reddit.remove(item, false)));

    if (lock) {
        await Promise.all(itemIds.map(async (itemId) => {
            const item = await getPostOrCommentById(itemId);
            await item.lock();
        }));
    }

    if (replyComment && replyComment.trim().length > 0) {
        const subredditName = context.subredditName;
        const commentToAdd = replyComment + `\n\n*I am a bot, and this action was performed automatically. Please [contact the moderators of this subreddit](https://www.reddit.com/r/${subredditName}/about/moderators) if you have any questions or concerns.*`;

        for (const itemId of itemIds) {
            const target = await getPostOrCommentById(itemId);
            const removalReasonForUsername = await getRemovalReasonForUsername(target.authorName);
            if (removalReasonForUsername === UserActiveStatus.Shadowbanned || removalReasonForUsername === UserActiveStatus.Suspended) {
                const newComment = await reddit.submitComment({
                    id: itemId,
                    text: commentToAdd,
                });
                await newComment.distinguish();
                await newComment.lock();
            }
        }
    }
}

export async function checkQueue () {
    const knownModerators = await getCachedModeratorList();

    let modQueue = await reddit.getModQueue({
        subreddit: context.subredditName,
        type: "all",
        limit: 1000,
    }).all().then(items => items.filter(item => !knownModerators.has(item.authorName)));

    if (modQueue.length === 0) {
        console.log("Check step: No items in the mod queue.");
        return;
    }

    const appSettings = await settings.getAll();

    const alreadyRemovedItems = new Set<string>();

    if (appSettings[AppSetting.RemoveDeleted]) {
        // Remove items from deleted users
        const itemsToRemove = modQueue.filter(item => item.authorName === "[deleted]" && item.userReportReasons.length === 0);
        if (itemsToRemove.length > 0) {
            const shouldLock = appSettings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
            await removeItems(itemsToRemove.map(item => item.id), shouldLock, undefined);
            itemsToRemove.forEach(item => alreadyRemovedItems.add(item.id));
            console.log(`Check step: Removed ${itemsToRemove.length} ${pluralize("item", itemsToRemove.length)} from the mod queue due to deleted users.`);
        }
    }

    if (alreadyRemovedItems.size > 0) {
        modQueue = modQueue.filter(item => !alreadyRemovedItems.has(item.id));
    }

    if (appSettings[AppSetting.RemoveItemsRemovedByReddit]) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const itemsToRemove = modQueue.filter(item => item.body?.startsWith("[ Removed by Reddit") || ("title" in item && item.title.startsWith("[ Removed by Reddit")));
        if (itemsToRemove.length > 0) {
            const shouldLock = appSettings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
            await removeItems(itemsToRemove.map(item => item.id), shouldLock, undefined);
            itemsToRemove.forEach(item => alreadyRemovedItems.add(item.id));
            console.log(`Check step: Removed ${itemsToRemove.length} ${pluralize("item", itemsToRemove.length)} from the mod queue due to being removed by Reddit Legal or Anti-Evil Ops.`);
        }
    }

    if (appSettings[AppSetting.RemoveCommentsOnRemovedPosts] || appSettings[AppSetting.RemoveCommentsOnDeletedPosts]) {
        const postsInQueue = new Set(modQueue.filter(item => isT3(item.id)).map(item => item.id));
        const uniquePosts = uniq(modQueue.filter(item => isT1(item.id)).map(item => item as Comment).filter(item => !postsInQueue.has(item.postId)).map(item => item.postId));
        const postsToRemoveContentFrom = new Set<string>();

        await Promise.all(uniquePosts.map(async (postId) => {
            const post = await reddit.getPostById(postId);

            if (appSettings[AppSetting.RemoveCommentsOnRemovedPosts]) {
                const categoriesToRemove = ["author", "moderator", "anti_evil_ops", "community_ops", "content_takedown", "copyright_takedown"];
                console.log(post.removedByCategory);
                if (post.removedByCategory && categoriesToRemove.includes(post.removedByCategory)) {
                    postsToRemoveContentFrom.add(postId);
                }
            }

            if (appSettings[AppSetting.RemoveCommentsOnDeletedPosts] && post.authorName === "[deleted]") {
                postsToRemoveContentFrom.add(postId);
            }
        }));

        if (postsToRemoveContentFrom.size > 0) {
            const shouldLock = appSettings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
            const itemsToRemove = modQueue.filter(item => isT1(item.id) && "postId" in item && postsToRemoveContentFrom.has(item.postId));
            await removeItems(itemsToRemove.map(item => item.id), shouldLock, undefined);
            console.log(`Check step: Removed ${itemsToRemove.length} ${pluralize("comment", itemsToRemove.length)} from the mod queue due to removed or deleted posts.`);
        }
    }

    if (!appSettings[AppSetting.RemoveShadowbanned] && !appSettings[AppSetting.RemoveBanned]) {
        return;
    }

    const usersInModqueue = uniq(modQueue
        .filter(item => item.authorName !== "[deleted]")
        .map(item => item.authorName));

    const existingCheckQueue = await redis.zRange(USER_QUEUE_KEY, 0, -1);
    const existingUsers = new Set(existingCheckQueue.map(user => user.member));
    const newUsers = usersInModqueue.filter(user => !existingUsers.has(user));

    if (newUsers.length > 0) {
        await redis.zAdd(USER_QUEUE_KEY, ...newUsers.map(user => ({ member: user, score: Date.now() })));
        console.log(`Check step: Added ${newUsers.length} new ${pluralize("user", newUsers.length)} to the queue.`);
    }

    const totalInQueue = await redis.zCard(USER_QUEUE_KEY);
    console.log(`Check step: There ${pluralize("is", totalInQueue)} now ${totalInQueue} ${pluralize("user", totalInQueue)} in the queue.`);

    if (totalInQueue === 0) {
        console.log("Check step: No users in the queue after processing, skipping scheduling prune job.");
        return;
    }

    await scheduler.runJob<PruneUsersJobData>({
        name: ScheduledJob.PruneUsers,
        runAt: addSeconds(new Date(), 5),
        data: {
            firstRun: true,
            runRemove: false,
            jobGuid: crypto.randomUUID(),
        },
    });
}

export async function pruneUsers (event: TaskRequest<PruneUsersJobData | undefined>) {
    const jobGuid = event.data?.jobGuid;
    if (jobGuid && await hasTriggerBeenHandled(`job:${jobGuid}`, { expiration: addMinutes(new Date(), 5) })) {
        console.warn(`Prune step: Job with guid ${jobGuid} has already been handled, skipping.`);
        return;
    }

    const runRecentlyKey = "pruneUsersRecentlyRun";
    if (event.data?.firstRun && await redis.get(runRecentlyKey)) {
        return;
    }

    let runRemove = event.data?.runRemove ?? false;

    const runLimit = addSeconds(new Date(), 10);
    const queue = await redis.zRange(USER_QUEUE_KEY, 0, Date.now(), { by: "score" });

    if (queue.length === 0) {
        await redis.del(runRecentlyKey);
        return;
    }

    await redis.set(runRecentlyKey, "", { expiration: addSeconds(new Date(), 30) });

    const appSettings = await settings.getAll();
    const subredditName = context.subredditName;

    let processed = 0;
    const usersToRemoveFromQueue = new Set<string>();

    while (queue.length > 0 && new Date() < runLimit) {
        const user = queue.shift();
        if (!user) {
            break;
        }

        processed++;

        if (appSettings[AppSetting.RemoveShadowbanned]) {
            const userStatus = await getUserActiveStatus(user.member);

            const userCheckKey = `userCheck:${user.member}`;
            if (userStatus !== UserActiveStatus.Active) {
                const userCheckCount = await redis.incrBy(userCheckKey, 1);
                await redis.expire(userCheckKey, 60 * 60);

                if (userCheckCount > 3) {
                    // We've now had three checks of this user. Now queue for removal.
                    usersToRemoveFromQueue.add(user.member);
                    await redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
                    await storeRemovalReasonForUsername(user.member, userStatus);
                    console.log(`Prune step: User ${user.member} has been checked ${userCheckCount} times and is still ${userStatus}, adding to remove queue.`);
                    runRemove = true;
                } else {
                    // Requeue the user for another check later.
                    await redis.zAdd(USER_QUEUE_KEY, { member: user.member, score: addSeconds(new Date(), 90).getTime() });
                    console.log(`Prune step: User ${user.member} is ${userStatus}, checked ${userCheckCount} ${pluralize("time", userCheckCount)}, requeuing for another check later (check count: ${userCheckCount}).`);
                }

                continue;
            } else {
                await redis.del(userCheckKey);
                usersToRemoveFromQueue.add(user.member);
            }
        }

        if (appSettings[AppSetting.RemoveBanned]) {
            if (await isBanned(subredditName, user.member)) {
                console.log(`Prune step: User ${user.member} is banned, adding to remove queue.`);
                await redis.zAdd(REMOVE_QUEUE, { member: user.member, score: Date.now() });
                runRemove = true;
            }
            usersToRemoveFromQueue.add(user.member);
        }
    }

    await redis.zRem(USER_QUEUE_KEY, Array.from(usersToRemoveFromQueue));
    console.log(`Prune step: Processed ${processed} ${pluralize("user", processed)} in the prune job.`);

    if (queue.length > 0) {
        console.log(`Prune step: ${queue.length} ${pluralize("user", queue.length)} left in the queue.`);

        await scheduler.runJob<PruneUsersJobData>({
            name: ScheduledJob.PruneUsers,
            runAt: addSeconds(new Date(), 5),
            data: { firstRun: false, runRemove, jobGuid: crypto.randomUUID() },
        });
    } else if (runRemove) {
        await scheduler.runJob<RemoveUsersJobData>({
            name: ScheduledJob.RemoveUsers,
            runAt: addSeconds(new Date(), 5),
            data: { jobGuid: crypto.randomUUID() },
        });
        await redis.del(runRecentlyKey);
    }
}

export async function removeUsers (event: TaskRequest<RemoveUsersJobData | undefined>) {
    const jobGuid = event.data?.jobGuid;
    if (jobGuid && await hasTriggerBeenHandled(`job:${jobGuid}`, { expiration: addMinutes(new Date(), 5) })) {
        console.warn(`Prune step: Job with guid ${jobGuid} has already been handled, skipping.`);
        return;
    }

    const removeQueue = await redis.zRange(REMOVE_QUEUE, 0, -1);

    if (removeQueue.length === 0) {
        return;
    }

    const modQueue = await reddit.getModQueue({
        subreddit: context.subredditName,
        type: "all",
        limit: 1000,
    }).all();

    const itemsToRemove = modQueue.filter(item => removeQueue.some(user => user.member === item.authorName));
    if (itemsToRemove.length > 0) {
        const appSettings = await settings.getAll();
        const shouldLock = appSettings[AppSetting.LockOnRemove] as boolean | undefined ?? false;
        const replyComment = appSettings[AppSetting.ReplyCommentForShadowbanned] as string | undefined;
        await removeItems(itemsToRemove.map(item => item.id), shouldLock, replyComment);
        console.log(`Remove step: Removed ${itemsToRemove.length} ${pluralize("item", itemsToRemove.length)} from the mod queue for shadowbanned or suspended users.`);
    } else {
        console.log("Remove step: No items found in the mod queue for users to remove.");
    }

    await redis.zRem(REMOVE_QUEUE, removeQueue.map(user => user.member));
}

import { TriggerContext } from "@devvit/public-api";
import { getUserExtended } from "@fsvreddit/fsv-devvit-helpers";

export enum UserActiveStatus {
    Active = "active",
    Deleted = "deleted",
    Suspended = "suspended",
    Shadowbanned = "shadowbanned",
}

export async function getUserActiveStatus (username: string, context: TriggerContext): Promise<UserActiveStatus> {
    const user = await getUserExtended(username, context);
    if (user?.isSuspended) {
        return UserActiveStatus.Suspended;
    }

    if (user) {
        return UserActiveStatus.Active;
    }

    /* If the user could not be retrieved, they may be shadowbanned or deleted.
     *
     * This can be tested by attempting to retrieve mod notes. Mod notes for shadowbanned or suspended
     * users can be retrieved, but deleted users will return an error.
     *
     * */
    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();
    try {
        await context.reddit.getModNotes({
            subreddit: subredditName,
            user: username,
        }).all();
        // User is either suspended or shadowbanned.
        return UserActiveStatus.Shadowbanned;
    } catch {
        // User is deleted.
        return UserActiveStatus.Deleted;
    }
}

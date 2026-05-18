import { JobContext, TriggerContext } from "@devvit/public-api";
import { ModAction } from "@devvit/protos";
import pluralize from "pluralize";

const KNOWN_MODLIST_KEY = "knownModList";

export async function getCachedModeratorList (context: TriggerContext): Promise<Set<string>> {
    const modList = await context.redis.hKeys(KNOWN_MODLIST_KEY);
    return new Set(modList);
}

export async function refreshModeratorList (context: TriggerContext) {
    const moderators = await context.reddit.getModerators({
        subredditName: context.subredditName ?? await context.reddit.getCurrentSubredditName(),
    }).all();

    await context.redis.del(KNOWN_MODLIST_KEY);
    await context.redis.hSet(KNOWN_MODLIST_KEY, Object.fromEntries(moderators.map(mod => [mod.username, "true"])));

    console.log(`Moderator list refreshed. Stored ${moderators.length} ${pluralize("moderator", moderators.length)} in cache.`);
}

export async function handleRefreshModeratorListJob (_: unknown, context: JobContext) {
    await refreshModeratorList(context);
}

export async function handleModAction (event: ModAction, context: TriggerContext) {
    if (event.action?.includes("moderator")) {
        await refreshModeratorList(context);
    }
}

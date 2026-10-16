import { context, reddit, redis } from "@devvit/web/server";
import pluralize from "pluralize";

const KNOWN_MODLIST_KEY = "knownModList";

export async function getCachedModeratorList (): Promise<Set<string>> {
    const modList = await redis.hKeys(KNOWN_MODLIST_KEY);
    return new Set(modList);
}

export async function refreshModeratorList () {
    const moderators = await reddit.getModerators({
        subredditName: context.subredditName,
        limit: 1000,
    }).all();

    await redis.del(KNOWN_MODLIST_KEY);
    await redis.hSet(KNOWN_MODLIST_KEY, Object.fromEntries(moderators.map(mod => [mod.username, "true"])));

    console.log(`Moderator list refreshed. Stored ${moderators.length} ${pluralize("moderator", moderators.length)} in cache.`);
}

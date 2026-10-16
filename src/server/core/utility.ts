import { reddit } from "@devvit/web/server";

export async function isBanned (subredditName: string, username: string): Promise<boolean> {
    const banList = await reddit.getBannedUsers({
        subredditName,
        username,
    }).all();

    return banList.length > 0;
}

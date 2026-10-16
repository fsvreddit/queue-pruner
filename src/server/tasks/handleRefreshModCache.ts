import { TaskResponse } from "@devvit/web/server";
import { Context } from "hono";
import { refreshModeratorList } from "../core";

export const handleRefreshModCacheJob = async (c: Context): Promise<Response> => {
    await refreshModeratorList();

    return c.json<TaskResponse>({ message: "Handled refresh mod cache job." }, 200);
};

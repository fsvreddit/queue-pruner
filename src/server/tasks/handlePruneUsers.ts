import { TaskRequest, TaskResponse } from "@devvit/web/server";
import { Context } from "hono";
import { pruneUsers } from "../core";

export type PruneUsersJobData = {
    firstRun: boolean;
    runRemove: boolean;
    jobGuid: string;
};

export const handlePruneUsersJob = async (c: Context): Promise<Response> => {
    const request = await c.req.json<TaskRequest<PruneUsersJobData>>();

    await pruneUsers(request);

    return c.json<TaskResponse>({ message: "Prune users job handled." }, 200);
};

import { TaskRequest, TaskResponse } from "@devvit/web/server";
import { Context } from "hono";
import { removeUsers } from "../core";

export type RemoveUsersJobData = {
    jobGuid: string;
};

export const handleRemoveUsersJob = async (c: Context): Promise<Response> => {
    const request = await c.req.json<TaskRequest<RemoveUsersJobData>>();

    await removeUsers(request);

    return c.json<TaskResponse>({ message: "Remove users job handled." }, 200);
};

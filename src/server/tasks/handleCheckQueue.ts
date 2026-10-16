import { TaskResponse } from "@devvit/web/server";
import { Context } from "hono";
import { checkQueue } from "../core";

export const handleCheckQueueJob = async (c: Context): Promise<Response> => {
    await checkQueue();

    return c.json<TaskResponse>({ message: "Handled check queue job." }, 200);
};

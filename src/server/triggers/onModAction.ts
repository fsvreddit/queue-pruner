import { OnModActionRequest, TriggerResponse } from "@devvit/web/shared";
import { Context } from "hono";
import { refreshModeratorList } from "../core";

export const onModAction = async (c: Context): Promise<Response> => {
    const event = await c.req.json<OnModActionRequest>();

    if (event.action?.includes("moderator")) {
        await refreshModeratorList();
    }

    return c.json<TriggerResponse>({ message: "Job scheduled." }, 200);
};

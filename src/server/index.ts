import { Hono } from "hono";
import { createServer, getServerPort } from "@devvit/web/server";
import { getRequestListener } from "@hono/node-server";
import { onModAction, onAppInstall, onAppUpgrade } from "./triggers";
import { handleRefreshModCacheJob, handleCheckQueueJob, handleRemoveUsersJob, handlePruneUsersJob } from "./tasks";

const application = new Hono();

// Triggers

application.post("/internal/triggers/app-install", onAppInstall);
application.post("/internal/triggers/app-upgrade", onAppUpgrade);
application.post("/internal/triggers/mod-action", onModAction);

// Scheduler jobs
application.post("/internal/tasks/check-queue", handleCheckQueueJob);
application.post("/internal/tasks/prune-users", handlePruneUsersJob);
application.post("/internal/tasks/remove-users", handleRemoveUsersJob);

application.post("/internal/tasks/refresh-moderator-list", handleRefreshModCacheJob);

const server = createServer(getRequestListener(application.fetch));
server.on("error", (err) => {
    console.error(`server error; ${err.stack}`);
});

const port = getServerPort();
server.listen(port);

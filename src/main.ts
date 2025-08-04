import { Devvit } from "@devvit/public-api";
import { ScheduledJob } from "./constants.js";
import { handleInstallOrUpgrade } from "./installActions.js";
import { checkQueue, pruneUsers, removeUsers } from "./pruneQueue.js";

Devvit.addTrigger({
    events: ["AppInstall", "AppUpgrade"],
    onEvent: handleInstallOrUpgrade,
});

Devvit.addSchedulerJob({
    name: ScheduledJob.CheckQueue,
    onRun: checkQueue,
});

Devvit.addSchedulerJob({
    name: ScheduledJob.PruneUsers,
    onRun: pruneUsers,
});

Devvit.addSchedulerJob({
    name: ScheduledJob.RemoveUsers,
    onRun: removeUsers,
});

Devvit.configure({
    redditAPI: true,
});

export default Devvit;

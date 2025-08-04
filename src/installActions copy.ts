import { AppInstall, AppUpgrade } from "@devvit/protos";
import { TriggerContext } from "@devvit/public-api";
import { PRUNE_USERS_CRON, ScheduledJob } from "./constants.js";

export async function handleInstallOrUpgrade (event: AppInstall | AppUpgrade, context: TriggerContext) {
    const jobs = await context.scheduler.listJobs();
    await Promise.all(jobs.map(job => context.scheduler.cancelJob(job.id)));

    await context.scheduler.runJob({
        name: ScheduledJob.CheckQueue,
        cron: "0/5 * * * *",
    });

    await context.scheduler.runJob({
        name: ScheduledJob.PruneUsers,
        cron: PRUNE_USERS_CRON,
        data: { runRemove: false },
    });
}

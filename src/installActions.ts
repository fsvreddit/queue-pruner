import { AppInstall, AppUpgrade } from "@devvit/protos";
import { TriggerContext } from "@devvit/public-api";
import { CHECK_QUEUE_CRON, ScheduledJob } from "./constants.js";

export async function handleInstallOrUpgrade (event: AppInstall | AppUpgrade, context: TriggerContext) {
    const jobs = await context.scheduler.listJobs();
    await Promise.all(jobs.map(job => context.scheduler.cancelJob(job.id)));

    await context.scheduler.runJob({
        name: ScheduledJob.CheckQueue,
        cron: CHECK_QUEUE_CRON,
    });
}

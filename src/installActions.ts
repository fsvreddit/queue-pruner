import { AppInstall, AppUpgrade } from "@devvit/protos";
import { TriggerContext } from "@devvit/public-api";
import { ScheduledJob } from "./constants.js";

export async function handleInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const jobs = await context.scheduler.listJobs();
    await Promise.all(jobs.map(job => context.scheduler.cancelJob(job.id)));

    const runFrequency = 2; // I.e. every two minutes
    const randomMinute = Math.floor(Math.random() * runFrequency);

    await context.scheduler.runJob({
        name: ScheduledJob.CheckQueue,
        cron: `${randomMinute}/${runFrequency} * * * *`,
    });

    console.log("App installed or upgraded: scheduled jobs have been set up.");
}

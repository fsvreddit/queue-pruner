import { AppInstall, AppUpgrade } from "@devvit/protos";
import { TriggerContext } from "@devvit/public-api";
import { ScheduledJob } from "./constants.js";
import { addSeconds } from "date-fns";

export async function handleInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const jobs = await context.scheduler.listJobs();
    await Promise.all(jobs.map(job => context.scheduler.cancelJob(job.id)));

    const runFrequency = 2; // I.e. every two minutes
    let randomMinute = Math.floor(Math.random() * runFrequency);

    await context.scheduler.runJob({
        name: ScheduledJob.CheckQueue,
        cron: `${randomMinute}/${runFrequency} * * * *`,
    });

    randomMinute = Math.floor(Math.random() * 60);
    const randomHour = Math.floor(Math.random() * 24);

    await context.scheduler.runJob({
        name: ScheduledJob.RefreshModeratorList,
        cron: `${randomMinute} ${randomHour} * * *`,
    });

    await context.scheduler.runJob({
        name: ScheduledJob.RefreshModeratorList,
        runAt: addSeconds(new Date(), 5),
    });

    console.log(`App installed or upgraded: scheduled jobs have been set up. On version ${context.appVersion}.`);
}

import { context, scheduler } from "@devvit/web/server";
import { ScheduledJob } from ".";
import { addSeconds } from "date-fns";

export async function handleInstallOrUpgrade () {
    const jobs = await scheduler.listJobs();
    await Promise.all(jobs.map(job => scheduler.cancelJob(job.id)));

    const runFrequency = 2; // I.e. every two minutes
    let randomMinute = Math.floor(Math.random() * runFrequency);

    await scheduler.runJob({
        name: ScheduledJob.CheckQueue,
        cron: `${randomMinute}/${runFrequency} * * * *`,
    });

    randomMinute = Math.floor(Math.random() * 60);
    const randomHour = Math.floor(Math.random() * 24);

    await scheduler.runJob({
        name: ScheduledJob.RefreshModeratorList,
        cron: `${randomMinute} ${randomHour} * * *`,
    });

    await scheduler.runJob({
        name: ScheduledJob.RefreshModeratorList,
        runAt: addSeconds(new Date(), 5),
    });

    console.log(`App installed or upgraded: scheduled jobs have been set up. On version ${context.appVersion}.`);
}

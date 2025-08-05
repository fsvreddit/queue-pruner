export enum ScheduledJob {
    CheckQueue = "checkQueue",
    PruneUsers = "pruneUsers",
    RemoveUsers = "removeUsers",
}

export const CHECK_QUEUE_CRON = "0/5 * * * *";

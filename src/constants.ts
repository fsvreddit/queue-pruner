export enum ScheduledJob {
    CheckQueue = "checkQueue",
    PruneUsers = "pruneUsers",
    RemoveUsers = "removeUsers",
}

export const PRUNE_USERS_CRON = "1/5 * * * *";

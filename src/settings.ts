import { SettingsFormField } from "@devvit/public-api";

export enum AppSetting {
    RemoveDeleted = "removeDeleted",
    RemoveShadowbanned = "removeShadowbanned",
    RemoveBanned = "removeBanned",
    LockOnRemove = "lockOnRemove",
    ReplyCommentForShadowbanned = "replyCommentForShadowbanned",
}

export const appSettings: SettingsFormField[] = [
    {
        name: AppSetting.RemoveDeleted,
        type: "boolean",
        defaultValue: true,
        label: "Remove modqueued content for deleted users",
    },
    {
        name: AppSetting.RemoveShadowbanned,
        type: "boolean",
        defaultValue: true,
        label: "Remove modqueued content for suspended and shadowbanned users",
    },
    {
        name: AppSetting.RemoveBanned,
        type: "boolean",
        defaultValue: false,
        label: "Remove modqueued content for banned users",
    },
    {
        name: AppSetting.LockOnRemove,
        type: "boolean",
        defaultValue: false,
        label: "Lock posts or comments when removing from modqueue",
    },
    {
        name: AppSetting.ReplyCommentForShadowbanned,
        type: "paragraph",
        label: "If a user is found to be shadowbanned or suspended, reply to their content with this comment before removal.",
        helpText: "Leave blank to skip replying. Markdown is supported. You may wish to use this to alert users to the appeal process.",
    },
];

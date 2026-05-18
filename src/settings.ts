import { SettingsFormField } from "@devvit/public-api";

export enum AppSetting {
    RemoveDeleted = "removeDeleted",
    RemoveShadowbanned = "removeShadowbanned",
    RemoveBanned = "removeBanned",
    RemoveCommentsOnRemovedPosts = "removeCommentsOnRemovedPosts",
    RemoveCommentsOnDeletedPosts = "removeCommentsOnDeletedPosts",
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
        name: AppSetting.RemoveCommentsOnRemovedPosts,
        type: "boolean",
        defaultValue: false,
        label: "Remove modqueued comments on removed posts",
        helpText: "This will not take action on comments on posts filtered to the queue or removed by AutoModerator, only posts removed by moderators, Reddit Legal or Anti-Evil Ops.",
    },
    {
        name: AppSetting.RemoveCommentsOnDeletedPosts,
        type: "boolean",
        defaultValue: false,
        label: "Remove modqueued comments on deleted posts",
        helpText: "This will remove modqueued comments on any post that has been deleted, regardless of the reason for deletion.",
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
        label: "If a user is found to be shadowbanned or suspended, reply to their content with this comment on removal.",
        helpText: "Leave blank to skip replying. Markdown is supported. You may wish to use this to alert users to the appeal process.",
    },
];

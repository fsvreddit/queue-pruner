import { SettingsFormField } from "@devvit/public-api";

export enum AppSetting {
    RemoveDeleted = "removeDeleted",
    RemoveShadowbanned = "removeShadowbanned",
    RemoveBanned = "removeBanned",
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
];

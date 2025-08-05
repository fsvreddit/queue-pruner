import { SettingsFormField } from "@devvit/public-api";

export enum AppSetting {
    RemoveDeleted = "removeDeleted",
    RemoveShadowbanned = "removeShadowbanned",
}

export const appSettings: SettingsFormField[] = [
    {
        name: AppSetting.RemoveDeleted,
        type: "boolean",
        defaultValue: true,
        label: "Remove content for deleted Users",
    },
    {
        name: AppSetting.RemoveShadowbanned,
        type: "boolean",
        defaultValue: true,
        label: "Remove content for suspended and shadowbanned users",
    },
];

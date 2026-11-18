import type { Component } from "solid-js";
import ChinaScreen from "./china";
import GuangdongScreen from "./guangdong";

export interface ScreenDefinition {
	label: string;
	/** 悬浮球环绕选项用的短名称 */
	short: string;
	component: Component;
}

export const screenRegistry = {
	guangdong: {
		label: "广东省大屏",
		short: "广东",
		component: GuangdongScreen,
	},
	china: {
		label: "中国大屏",
		short: "中国",
		component: ChinaScreen,
	},
} satisfies Record<string, ScreenDefinition>;

export type ScreenId = keyof typeof screenRegistry;

export const screenOptions = Object.fromEntries(
	Object.entries(screenRegistry).map(([id, screen]) => [screen.label, id]),
) as Record<string, ScreenId>;

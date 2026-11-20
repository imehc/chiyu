import { type Component, lazy } from "solid-js";

export interface ScreenDefinition {
	label: string;
	/** 悬浮球环绕选项用的短名称 */
	short: string;
	component: Component;
}

export const screenRegistry = {
	blue: {
		label: "复杂大屏",
		short: "复杂",
		component: lazy(() => import("./blue")),
	},
	chongqing: {
		label: "重庆市大屏",
		short: "重庆",
		component: lazy(() => import("./chongqing")),
	},
	guangdong: {
		label: "广东省大屏",
		short: "广东",
		component: lazy(() => import("./guangdong")),
	},
	china: {
		label: "中国大屏",
		short: "中国",
		component: lazy(() => import("./china")),
	},
} satisfies Record<string, ScreenDefinition>;

export type ScreenId = keyof typeof screenRegistry;

export const screenOptions = Object.fromEntries(
	Object.entries(screenRegistry).map(([id, screen]) => [screen.label, id]),
) as Record<string, ScreenId>;

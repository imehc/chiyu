/**
 * 大屏注册表。
 * 集中登记四块大屏（复杂 / 重庆 / 广东 / 中国）的展示名、短名与组件，
 * 供 App.tsx 生成切换下拉、URL 的 ?screen= 参数以及 Suspense 下的动态组件。
 * 新增一块大屏只需在 screenRegistry 里加一项，ScreenId 会自动扩展。
 */
import { type Component, lazy } from "solid-js";

/** 单个大屏的注册信息 */
export interface ScreenDefinition {
	/** 完整名称，用于下拉选项文案与侧栏宽度测量 */
	label: string;
	/** 悬浮球环绕选项用的短名称 */
	short: string;
	/**
	 * 大屏组件。统一用 lazy 包裹：每块大屏各自带着 Three.js 场景与图表，
	 * 首屏只加载当前这一块，切换时再按需拉取对应 chunk。
	 */
	component: Component;
}

/** 大屏注册表，键即 URL 里的 screen 取值，同时决定下拉框顺序。 */
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

/**
 * 大屏标识的联合类型，由注册表的键推导而来（"blue" | "chongqing" | "guangdong" | "china"）。
 * 之所以用 satisfies + keyof 而不是显式枚举，是为了加一项就自动同步类型，避免两处维护。
 */
export type ScreenId = keyof typeof screenRegistry;

/**
 * 下拉选项映射：label → id。
 * Tweakpane 的 options 需要「显示文案到值」的字典，而注册表是反过来的，
 * 因此这里做一次反转；App.tsx 用它渲染切换器，并在 change 时直接拿到 ScreenId。
 * 注意键是 label，所以各屏的 label 必须唯一。
 */
export const screenOptions = Object.fromEntries(
	Object.entries(screenRegistry).map(([id, screen]) => [screen.label, id]),
) as Record<string, ScreenId>;

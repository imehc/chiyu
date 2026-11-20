/**
 * 中国大屏左右图表栏的出口。
 * 只负责把 options.ts 里的配置数组摊平成 ChartPanel 列表，
 * 由 index.tsx 分别放到左右两侧的透视容器中。
 */
import { For } from "solid-js";
import ChartPanel from "./chart-panel";
import { chinaLeftPanels, chinaRightPanels } from "./options";

/**
 * 左侧图表栏：四张偏榜单/趋势的横向图表。
 * 顺序即视觉上的从上到下，配置数组本身是有序的，不需要额外排序。
 */
export function ChinaLeftPanels() {
	return (
		<For each={chinaLeftPanels}>
			{(panel) => (
				<ChartPanel title={panel.title} option={panel.option} side="left" />
			)}
		</For>
	);
}

/** 右侧图表栏：雷达、柱状、仪表盘、双折线四张图表。 */
export function ChinaRightPanels() {
	return (
		<For each={chinaRightPanels}>
			{(panel) => (
				<ChartPanel title={panel.title} option={panel.option} side="right" />
			)}
		</For>
	);
}

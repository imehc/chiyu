/**
 * 单张 ECharts 卡片：Card 提供标题与边框，内部挂一个自适应尺寸的图表容器。
 * 由 panels/index.tsx 按配置数组批量渲染，属于左右侧栏的最底层单元。
 */
import { type ECharts, type EChartsOption, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../../../componnets/card";

interface ChartPanelProps {
	/** 卡片标题，显示在 Card 的头部，图表配置里不再重复写标题 */
	title: string;
	/** 完整的 ECharts 配置，由 options.ts 静态给出，挂载时一次性注入 */
	option: EChartsOption;
	/** 所在侧别：决定入场位移方向与卡片 id（公共层按 #left-card / #right-card 做补间） */
	side: "left" | "right";
}

/**
 * 图表卡片组件。
 * 生命周期：onMount 里 init → setOption → 监听容器尺寸；
 * onCleanup 里先断开 ResizeObserver 再 dispose 实例，防止 resize 回调打到已销毁的图表上。
 * 容器高度由 Card 的 height 固定为 200，宽度随侧栏伸缩，因此需要 ResizeObserver 而非 window.resize。
 */
export default function ChartPanel(props: ChartPanelProps) {
	let chartRef!: HTMLDivElement;
	/** ECharts 实例，卸载后置为 undefined 由可选链兜住异步回调 */
	let chart: ECharts | undefined;
	let resizeObserver: ResizeObserver | undefined;

	onMount(() => {
		chart = init(chartRef);
		// 配置为静态数据，挂载时注入一次即可；不做增量更新，避免额外的渲染开销
		chart.setOption(props.option);
		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(chartRef);
	});

	onCleanup(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
	});

	// 外层 div 的初始位移与透明度供公共层的入场时间线补间，id 也被其选择器复用
	return (
		<div
			id={props.side === "left" ? "left-card" : "right-card"}
			class={`tw:mb-3 tw:opacity-0 ${
				props.side === "left"
					? "tw:-translate-x-[150%]"
					: "tw:translate-x-[150%]"
			}`}
		>
			<Card title={props.title} height={200}>
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

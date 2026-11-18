import { type ECharts, type EChartsOption, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../../../componnets/card";

interface ChartPanelProps {
	title: string;
	option: EChartsOption;
	side: "left" | "right";
}

export default function ChartPanel(props: ChartPanelProps) {
	let chartRef!: HTMLDivElement;
	let chart: ECharts | undefined;
	let resizeObserver: ResizeObserver | undefined;

	onMount(() => {
		chart = init(chartRef);
		chart.setOption(props.option);
		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(chartRef);
	});

	onCleanup(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
	});

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

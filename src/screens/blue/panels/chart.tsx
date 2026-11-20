import { type ECharts, type EChartsOption, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import { applyBlueChartTheme } from "../chart-theme";

type ChartOption =
	| EChartsOption
	| ((width: number, height: number) => EChartsOption);

export default function Chart(props: { option: ChartOption; label: string }) {
	let el!: HTMLDivElement;
	let chart: ECharts | undefined;
	let observer: ResizeObserver | undefined;
	onMount(() => {
		chart = init(el, undefined, { renderer: "canvas" });
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let previousSize: { width: number; height: number } | undefined;
		const applyOption = () => {
			if (!chart) return;
			const option =
				typeof props.option === "function"
					? props.option(chart.getWidth(), chart.getHeight())
					: props.option;
			chart.setOption(applyBlueChartTheme(option, motion.matches));
		};
		const update = () => {
			if (!chart) return;
			const width = el.clientWidth;
			const height = el.clientHeight;
			if (
				!width ||
				!height ||
				(previousSize?.width === width && previousSize?.height === height)
			)
				return;
			const firstRender = !previousSize;
			previousSize = { width, height };
			chart.resize();
			if (firstRender || typeof props.option === "function") applyOption();
		};
		update();
		observer = new ResizeObserver(update);
		observer.observe(el);
		motion.addEventListener("change", applyOption);
		onCleanup(() => motion.removeEventListener("change", applyOption));
	});
	onCleanup(() => {
		observer?.disconnect();
		chart?.dispose();
	});
	return (
		<div class="blue-chart" ref={el} role="img" aria-label={props.label} />
	);
}

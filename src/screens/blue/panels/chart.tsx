/**
 * ECharts 容器组件：负责实例创建、尺寸自适应、主题注入与销毁。
 * 被同目录 index.tsx 里的各面板使用；图表数据全部来自 options.ts，
 * 这里不关心业务，只回答「画布多大、何时重绘、何时释放」。
 */
import { type ECharts, type EChartsOption, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import { applyBlueChartTheme } from "../chart-theme";

/**
 * option 的两种形态：
 * 静态配置对象，或依赖画布宽高的工厂函数。
 * 工厂函数用于 graphic 装饰需要绝对像素坐标的图表（例如全球视图的环形图），
 * 每次尺寸变化都必须带着新的宽高重新求值。
 */
type ChartOption =
	| EChartsOption
	| ((width: number, height: number) => EChartsOption);

/**
 * 图表容器。
 * @param props.option 图表配置；传函数时会在首次挂载、容器尺寸变化与主题偏好变化时重新调用
 * @param props.label 无障碍描述，写入 aria-label，用于屏幕阅读器，界面上不可见
 * 生命周期：onMount 创建实例并监听容器尺寸，onCleanup 断开监听并 dispose，
 * 避免切屏或热更新后残留 canvas 与 ResizeObserver。
 */
export default function Chart(props: { option: ChartOption; label: string }) {
	/** 挂载点，既作为 ECharts 宿主也作为尺寸测量对象 */
	let el!: HTMLDivElement;
	/** ECharts 实例；各回调开头靠它判空，确保卸载后不再操作已销毁的实例 */
	let chart: ECharts | undefined;
	/** 尺寸监听句柄，必须在 onCleanup 里 disconnect */
	let observer: ResizeObserver | undefined;
	onMount(() => {
		// 第二参数传 undefined 表示不套用 ECharts 内置主题；配色统一由 applyBlueChartTheme 补
		chart = init(el, undefined, { renderer: "canvas" });
		// 跟随系统「减少动态效果」偏好，主题补丁会据此把入场动画时长归零
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		/** 上一次成功渲染的尺寸，同时充当「是否首次渲染」的标记 */
		let previousSize: { width: number; height: number } | undefined;
		/** 按当前画布尺寸求值 option 并写入实例；函数型 option 依赖宽高，所以每次都重新调用 */
		const applyOption = () => {
			if (!chart) return;
			const option =
				typeof props.option === "function"
					? props.option(chart.getWidth(), chart.getHeight())
					: props.option;
			chart.setOption(applyBlueChartTheme(option, motion.matches));
		};
		/** 尺寸变化后的统一入口：先 resize 画布，再决定是否需要重设 option */
		const update = () => {
			if (!chart) return;
			const width = el.clientWidth;
			const height = el.clientHeight;
			// 宽高为 0 说明容器还没布局（面板隐藏或尚未挂载完毕），此时 resize 会把画布压成 0×0；尺寸未变则跳过
			if (
				!width ||
				!height ||
				(previousSize?.width === width && previousSize?.height === height)
			)
				return;
			const firstRender = !previousSize;
			previousSize = { width, height };
			chart.resize();
			// 首次必须 setOption，否则画布是空的；函数型 option 依赖宽高，任何尺寸变化都得重算
			if (firstRender || typeof props.option === "function") applyOption();
		};
		update();
		observer = new ResizeObserver(update);
		observer.observe(el);
		// 动效偏好可能在页面停留期间被切换，需要即时重绘而不仅是等下次 resize
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

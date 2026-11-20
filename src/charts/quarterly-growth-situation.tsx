/**
 * 各季度增长情况：一至四季度两组数值（类型1 / 类型2）的分组柱状图。
 * 被重庆、广东两套大屏的右侧栏复用（screens/chongqing、screens/guangdong），
 * 数值为示例数据，单位为亿元（60~150 亿元量级）。
 */
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 各季度增长情况卡片。
 *
 * - props：无，季度与数值内联在 option 里，单位为亿元。
 * - 响应式依赖：option 是普通对象，仅用 satisfies 做类型检查，不参与响应式追踪。
 * - 生命周期：onMount 建实例并挂 ResizeObserver；onCleanup 先解绑监听再 dispose。
 * - 动画：未显式配置，沿用 ECharts 默认的 1000ms 入场动画。
 */
export default function QuarterlyGrowthSituation() {
	/** 图表挂载点，由 JSX 的 ref 赋值 */
	let chartRef: HTMLDivElement | undefined;
	/** ECharts 实例句柄，dispose 后置回 null 防止重复销毁 */
	let chartInstance: ECharts | null = null;

	const option = {
		// 左上角单位标签，替代被隐藏的 y 轴标题
		title: {
			text: "亿元",
			left: "5%",
			top: "8%",
			textStyle: {
				color: "#D3F8F2",
				fontSize: 8,
			},
		},
		// 与其它右侧卡片同一套留白：顶部给单位标签与柱顶留白，底部给季度标签
		grid: {
			left: "12%",
			top: "25%",
			width: "82%",
			height: "55%",
		},
		tooltip: {
			trigger: "axis",
			axisPointer: {
				type: "shadow",
				// 阴影全透明：只要 tooltip 气泡，不要灰块遮住 4px 细柱
				shadowStyle: { opacity: 0 },
			},
			backgroundColor: "rgba(0,0,0,1)",
			borderWidth: 1,
			borderColor: "#999999",
			textStyle: {
				color: "#ffffff",
				fontSize: 10,
			},
		},
		xAxis: [
			{
				type: "category",
				axisLine: {
					show: false,
					lineStyle: {
						color: "#435459",
					},
				},
				axisTick: {
					show: false,
				},
				splitLine: {
					show: false,
				},
				axisLabel: {
					color: "#ffffff",
					fontSize: 10,
					// 强制显示四个季度，避免窄容器下被自动抽稀
					interval: 0,
					padding: [0, 0, 0, 0],
				},
				data: ["一季度", "二季度", "三季度", "四季度"],
			},
			{
				// 空的载体轴：与下方被注释掉的「底板」系列配套，当前没有系列引用它，保留以便恢复装饰
				axisLine: {
					show: false,
					lineStyle: {
						color: "rgba(0,0,0,0)",
					},
				},
				data: [],
			},
		],
		yAxis: {
			type: "value",

			axisLine: {
				show: false,
			},
			axisTick: {
				show: false,
			},
			splitLine: {
				show: true,
				lineStyle: {
					// [2, 2] 是 2px 实线 + 2px 空白的虚线节律；width 0.3 让基准线足够淡
					type: [2, 2],
					dashOffset: 5,
					color: ["rgba(255, 255, 255, 1)"],
					opacity: 1,
					width: 0.3,
				},
			},
			axisLabel: {
				color: "#8B9EA4",
				fontSize: 9,
			},
		},
		series: [
			{
				// 类型1：青绿柱，4px 细柱是设计稿的「光条」造型；label 关闭，数值靠 tooltip 查看
				name: "类型1",
				data: [100, 120, 130, 110],
				type: "bar",
				barWidth: 4,
				label: {
					show: false,
				},
				itemStyle: {
					borderRadius: 0,
					// 0,0 → 0,1 为自上而下：顶部亮青、底部沉入深青，模拟光条衰减
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{ offset: 0, color: "#79EBCF" },
						{ offset: 1, color: "#0B6360" },
					]),
				},
			},
			{
				// 类型2：蓝色柱，与类型1 同宽；
				// barGap 传数字时按像素计，2px 是两组细柱之间不至于贴死的最小间距
				name: "类型2",
				data: [60, 100, 150, 90],
				type: "bar",
				barWidth: 4,
				barGap: 2,
				label: {
					show: false,
				},
				itemStyle: {
					borderRadius: 0,
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{ offset: 0, color: "#40AEFE" },
						{ offset: 1, color: "#25567A" },
					]),
				},
			},
			// 已停用的第三组「底板」柱：曾用 xAxisIndex 1 的满格柱在每组后面垫一层灰底，
			// 恢复时需同时启用上面那条空的载体轴，否则 xAxisIndex 越界
			// {
			//   name: "",
			//   type: "bar",
			//   xAxisIndex: 1,
			//   z: 2,
			//   data: [150, 150, 150, 150],
			//   // 设置高亮样式
			//   emphasis: {
			//     focus: "none",
			//     itemStyle: { color: "rgba(255,255,255,0.8)" },
			//   },
			//   itemStyle: {
			//     color: "rgba(122,140,153,0.6)",
			//     opacity: 0.1,
			//   },
			// },
		],
	} satisfies EChartsOption;

	/**
	 * 建 ECharts 实例并写入 option，同时用 ResizeObserver 跟随容器尺寸重绘。
	 * @returns 解绑尺寸监听的清理函数；容器 ref 未就绪时返回 undefined，调用方需 `?.` 兜底。
	 */
	const initChart = () => {
		if (!chartRef) return;

		chartInstance = init(chartRef);
		chartInstance.setOption(option);

		// 自动调整大小
		const resizeObserver = new ResizeObserver(() => {
			// 卸载瞬间仍可能收到一次回调，可选链避免操作已销毁的实例
			chartInstance?.resize();
		});

		resizeObserver.observe(chartRef);

		return () => {
			resizeObserver.disconnect();
		};
	};

	/** 销毁实例并清空引用，重复调用安全。 */
	const disposeChart = () => {
		if (chartInstance) {
			chartInstance.dispose();
			chartInstance = null;
		}
	};

	onMount(() => {
		const cleanupResize = initChart();

		// 先解绑 ResizeObserver 再 dispose，避免尺寸回调打到已销毁实例
		onCleanup(() => {
			cleanupResize?.();
			disposeChart();
		});
	});

	// class 里的 translate-x-[150%] 与 opacity-0 是入场初始态，
	// 由 map-3d.ts 的 GSAP 时间线按 #right-card 选择器补间回 x:0 / opacity:1
	return (
		<div
			id="right-card"
			class="tw:flex-1 tw:mb-3 tw:translate-x-[150%] tw:opacity-0"
		>
			<Card title="各季度增长情况">
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

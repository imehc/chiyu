/**
 * 专项资金用途：横向条形图，对比四类专项资金的投放额（扶贫资金、医疗卫生、渔业资金、社区改造）。
 * 被重庆、广东两套大屏的右侧栏复用（screens/chongqing、screens/guangdong），
 * 数值为示例数据，单位为万元（50~100 万元量级）。
 * 类目名不画在 y 轴上，而是借 label 的 rich 文本写进条形内部；条形底下另有一层空心槽道。
 */
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 专项资金用途卡片。
 *
 * - props：无，类目与数值内联在 option 里，单位为万元。
 * - 响应式依赖：option 是普通对象，仅用 satisfies 做类型检查，不参与响应式追踪。
 * - 生命周期：onMount 建实例并挂 ResizeObserver；onCleanup 先解绑监听再 dispose。
 * - 动画：未显式配置，沿用 ECharts 默认的 1000ms 入场动画。
 */
export default function PurposeSpecialFunds() {
	/** 图表挂载点，由 JSX 的 ref 赋值 */
	let chartRef: HTMLDivElement | undefined;
	/** ECharts 实例句柄，dispose 后置回 null 防止重复销毁 */
	let chartInstance: ECharts | null = null;

	const option = {
		// 横向条形图只放四条，height 86% 让它们在垂直方向均分；
		// top 10% 与 legend 的 8% 错开，避免图例压住第一条
		grid: {
			left: "5%",
			top: "10%",
			width: "90%",
			height: "86%",
		},
		legend: {
			top: "8%",
			icon: "circle",
			// 8×8 的小圆点，只作系列标记，不承担信息量
			itemWidth: 8,
			itemHeight: 8,
			textStyle: {
				color: "#90979c",
				fontSize: 12,
				lineHeight: 20,
			},
		},

		tooltip: {
			trigger: "axis",
			axisPointer: {
				type: "shadow",
				shadowStyle: { opacity: 0.2 },
			},
			backgroundColor: "rgba(0,0,0,1)",
			borderWidth: 1,
			borderColor: "#999999",
			textStyle: {
				color: "#ffffff",
				fontSize: 10,
				// 156px 行高远超字号，会把多行 tooltip 撑得很高；当前内容只有一行，影响不明显
				lineHeight: 156,
			},
		},
		// 全局两色兜底；主条实际用每项的渐变，槽道用 "none" 填充，所以这两色基本不生效
		color: ["#6BC7F6", "#44E6A2"],
		xAxis: [
			{
				// 数值轴；interval 写 0 沿用模板习惯，刻度实际由数据范围自动划分
				type: "value",
				interval: 0,

				axisLine: {
					show: false,
					lineStyle: {
						color: "#407A80",
					},
				},
				axisTick: {
					show: false,
				},
				splitLine: {
					// 不画纵向网格线，避免与空心槽道糊在一起
					show: false,
				},
				axisLabel: {
					color: "#CFDAE6",
					fontSize: 10,
					interval: 0,
				},
			},
		],

		yAxis: [
			{
				type: "category",
				// inverse 让类目按 data 顺序自上而下排列（首项在顶部），符合阅读习惯
				inverse: true,
				axisLabel: {
					color: "#CFDAE6",
					fontSize: 10,
					interval: 0,
					// 类目名已由 label formatter 写进条形内部，这里关掉避免重复显示
					show: false,
					verticalAlign: "top",
				},
				axisLine: {
					show: false,
				},
				axisTick: {
					show: false,
				},
				splitLine: {
					show: false,
				},
				data: ["扶贫资金", "医疗卫生", "渔业资金", "社区改造"],
			},
			{
				// 空的载体轴，给槽道系列用；inverse 与第一根轴保持一致，否则两条会上下颠倒
				inverse: true,
				axisLine: {
					show: false,
					lineStyle: {
						color: "rgba(0,0,0,0)",
					},
				},
				data: [],
			},
		],
		// color: ["rgba(115,208,255,1)", "rgba(77, 255, 181, 1)", "rgba(230, 230, 230, 1)", "rgba(255, 200, 89, 1)"],
		series: [
			{
				// 主条：7px 细条，颜色逐项渐变（左上 → 右下），与右侧栏的其它卡片保持同一套冷暖色
				data: [
					{
						value: 100,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(3,65,128,1)" },
								{ offset: 1, color: "rgba(115,208,255,1)" },
							]),
						},
					},
					{
						value: 80,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(11, 77, 44, 1)" },
								{ offset: 1, color: "rgba(77, 255, 181, 1)" },
							]),
						},
					},
					{
						value: 60,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(117, 117, 117, 1)" },
								{ offset: 1, color: "rgba(230, 230, 230, 1)" },
							]),
						},
					},
					{
						value: 50,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(153, 105, 38, 1)" },
								{ offset: 1, color: "rgba(255, 200, 89, 1)" },
							]),
						},
					},
				],
				type: "bar",
				barWidth: 7,
				yAxisIndex: 0,
				showBackground: false,
				// z:2 保证细条压在槽道之上，否则描边框会盖住条形两端
				z: 2,
				label: {
					show: true,
					// 文字写在条形内部：柱高只有 7px，靠负的顶部 padding 把文本上提，视觉上居中于条形
					position: "middle",
					padding: [-18, 0, 0, 0],
					color: "#16C1A6",
					fontSize: 12,
					// 中间那一长串空格是把「值 + 单位」推到条形右端的排版手段：
					// label 宽度默认等于条形长度，靠空格撑开而不是另加定位，因此空格数量需与卡片宽度匹配
					formatter:
						"{title|{b}}                                                                              {value|{c}}  {unit|万元}",
					// rich 分段样式：标题白、数值继承主色、单位灰，三者在同一行里各有颜色
					rich: {
						title: {
							color: "#FFFFFF",
							fontSize: 10,
						},
						value: {
							fontSize: 10,
						},
						unit: {
							color: "#717477",
							fontSize: 10,
						},
					},
				},
				itemStyle: {
					borderRadius: 0,
					borderWidth: 2,
					borderColor: "rgba(26, 57, 77,1)",
				},
			},
			{
				// 槽道：宽 10px 的空心条，比主条宽 3px 形成外框；
				// barGap -100% 让两个系列完全重叠，data 统一 120 作为满格参考长度
				name: "背景",
				type: "bar",
				yAxisIndex: 1,
				barGap: "-100%",
				data: [120, 120, 120, 120],
				barWidth: 10,
				z: 0,
				itemStyle: {
					// 填充透明，只保留 1px 描边，得到「空槽」的观感
					color: "none",
					borderColor: "rgba(172,191,188,0.4)",
					borderWidth: 1,
					borderRadius: 0,
				},
			},
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
			<Card title="专项资金用途">
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

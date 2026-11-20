/**
 * 近年经济情况折线图（ECharts）：单条同比曲线 + 竖向渐变面积，走「亮线上、暗线托底」的统一大屏样式。
 * 被重庆 / 广东大屏左栏「近年经济情况」卡片引用，数据为 2023/04–2024/03 的示例值，单位亿元，量级 300~1330。
 */
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 近年经济情况组件，不接收 props：数据写死在 option 内，属静态展示卡片。
 * 生命周期：onMount 中 init + setOption 各一次，并挂 ResizeObserver 跟随容器；
 * onCleanup 中断开观察并 dispose 实例，避免大屏切页后残留监听与画布。
 */
export default function EconomicTrend() {
	let chartRef: HTMLDivElement | undefined;
	let chartInstance: ECharts | null = null;

	/**
	 * 完整配置。与用电情况卡片保持同一套视觉参数（网格留白、虚线颜色、渐变方向），
	 * 两图并排时不至于一深一浅；差异只在单系列、无图例、标签字号更大。
	 */
	const option = {
		// 单位标注放左上，字号 8px，尽量不占绘图区
		title: {
			text: "亿元",
			left: "5%",
			top: "8%",
			textStyle: {
				color: "#D3F8F2",
				fontSize: 8,
			},
		},
		// 百分比相对整个图表容器（canvas）宽高计算：left 12% + width 82%，右侧留 6% 给末端标签，避免被容器裁切
		grid: {
			left: "12%",
			top: "25%",
			width: "82%",
			height: "55%",
		},
		// axis 触发 + 半透明阴影指示，方便逐月读数；不透明黑底加 1px 灰边，保证压在网格上也清晰可读
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
			},
		},
		// 单系列配色，实际线条又被 lineStyle 的渐变覆盖，这里主要给 tooltip 色点用
		color: ["#6BC7F6"],
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
					// 隔一个显示一个：12 个月只出现 6 个标签，横向不拥挤
					interval: 1,
					padding: [0, 0, 0, 0],
				},
				// 与用电情况同口径，覆盖跨年的 12 个月
				data: [
					"2023/04",
					"2023/05",
					"2023/06",
					"2023/07",
					"2023/08",
					"2023/09",
					"2023/10",
					"2023/11",
					"2023/12",
					"2024/01",
					"2024/02",
					"2024/03",
				],
			},
			// 占位轴：不画轴线、data 为空，且没有任何 series 挂到它上面（本图只有一条线），
			// 与同屏用电情况卡片共用同一套轴结构，便于两图并排时留白一致；当前不参与绘制
			{
				axisLine: {
					show: false,
					lineStyle: {
						color: "rgba(0,0,0,0)",
					},
				},
				data: [],
			},
		],
		// 数值轴只留虚线网格：2-2 的 0.3px 细虚线，比实线弱一档，不抢折线的视觉重心
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
					// [2,2] 表示实 2px 空 2px；dashOffset 5 让虚线段起点错开，排布更均匀
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
			// 单系列：一条 3px 渐变线 + 10px 下沉阴影 + 面积渐变就凑齐了层次，
			// 不像用电情况那样拆成两层 series，因为这里没有第二条线需要压叠放顺序
			{
				// 示例数据：单位亿元，四季度与年初出现峰值（1300 左右），与 tooltip 的「亿元」标注对应
				data: [500, 1000, 300, 1300, 500, 1330, 620, 400, 700, 1300, 300, 1234],
				type: "line",
				// 平滑曲线弱化月度锯齿，代价是极值位置会有轻微视觉偏移
				smooth: true,
				// 内联 base64 光点（原图 20×20），symbolSize 给 10 即缩半显示，只作 hover 落点标记
				symbol:
					"image://data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAQ5JREFUOE+1la1OQ0EQRs8kCFIQdVCCxIBpCK1AInkDHC+B4QkwvASub4GsaE0NGCRpKhGFVDQZ+Mjem9vNbkphmWTMfjNnd3b2x0iYuxuwH7wNbIewBfAGzORm5nG6ElfM3QU6AXZSkzXG3oEnMxO8thWgux8DR2tAsfxiZs/VYA38Jazi1NBvYCizv+HK4vCRyrfQgIsf7Nm6+bSnjwIeAGeZaGnXQDfoE+ABmGbixwKeAoeJAMHuv3w30ubATQb6KqDKjZPEuAXOMysZAncJbS7gJbCVEAdAKwP8AK4S2vJfgMVLLt6UDtAreWx0W8od7OJXryq16OPwR2j6+WpAyz2wDagape7vARt9AZ+G3HmhiKS3xwAAAABJRU5ErkJggg==",
				symbolSize: 10,
				showSymbol: false, // 是否显示 symbol, 如果 false 则只有在 tooltip hover 的时候显示。
				yAxisIndex: 0,
				z: 0,
				// 设置高亮样式
				emphasis: {
					focus: "none",
					itemStyle: { color: "white" },
				},
				// 只有一条线，标签可以放大到 10px（用电情况是两条线，只能压到 8px）
				label: {
					show: true,
					position: "top",
					distance: 10,
					color: "#ffffff",
					fontSize: 10,
				},

				// 3px 线宽 + 10px 下沉的黑色阴影，让折线看起来有厚度；泛光只给 3，克制不抢数据
				lineStyle: {
					shadowColor: "rgba(0, 0, 0, 0.4)",
					shadowBlur: 3,
					shadowOffsetY: 10,
					width: 3,
					// LinearGradient(0,0,0,1)：沿包围盒自上而下，顶部亮蓝、底部深蓝
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(115, 208, 255, 1)",
						},
						{
							offset: 1,
							color: "rgba(18,60,98,1)",
						},
					]),
				},
				// 面积渐变：顶部 0.4 的青绿向下衰减到全透明，给曲线一个柔和的落地阴影，
				// 透明度刻意不给满，否则会糊住下方的虚线网格
				areaStyle: {
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(25, 255, 236, 0.4)",
						},
						{
							color: "rgba(51, 153, 255, 0)",
							offset: 1,
						},
					]),
				},
			},
		],
	} satisfies EChartsOption;

	/**
	 * 初始化实例并监听容器尺寸。
	 * 返回的清理函数交给 onCleanup；chartRef 未赋值时提前返回，所以返回值可能是 undefined。
	 * 用 ResizeObserver 而不是 window resize，是因为大屏卡片宽度由 flex 决定，窗口不变也可能变窄。
	 */
	const initChart = () => {
		if (!chartRef) return;

		chartInstance = init(chartRef);
		// option 只在挂载时下发一次；未配 animation，沿用 ECharts 默认入场动画，
		// 与卡片外层的 CSS 滑入错开，不额外叠加自定义缓动
		chartInstance.setOption(option);

		// 自动调整大小
		const resizeObserver = new ResizeObserver(() => {
			chartInstance?.resize();
		});

		resizeObserver.observe(chartRef);

		return () => {
			resizeObserver.disconnect();
		};
	};

	/**
	 * 销毁实例并把引用清空；dispose 后 resize 回调即便再触发，也会被 chartInstance 的可选链挡掉。
	 */
	const disposeChart = () => {
		if (chartInstance) {
			chartInstance.dispose();
			chartInstance = null;
		}
	};

	onMount(() => {
		const cleanupResize = initChart();

		// 先断观察再 dispose：否则销毁瞬间的尺寸变化可能对已销毁实例调 resize
		onCleanup(() => {
			cleanupResize?.();
			disposeChart();
		});
	});

	// 初始 -translate-x-[150%] + opacity-0 是大屏入场动画的起始态，由外部 GSAP 播放入场
	return (
		<div
			id="left-card"
			class="tw:flex-1 tw:mb-3 tw:-translate-x-[150%] tw:opacity-0"
		>
			<Card title="近年经济情况">
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

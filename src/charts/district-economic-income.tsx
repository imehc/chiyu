/**
 * 各区经济收益：对比五个城区（南山区 / 天河区 / 福田区 / 龙岗区 / 宝安区）的经济收益。
 * 被重庆、广东两套大屏的左侧栏复用（screens/chongqing、screens/guangdong），
 * 数值为示例数据，单位为亿元（5000~8000 亿元量级，按降序排列）。
 * 柱体用 pictorialBar 的自定义 SVG 轮廓画成「水滴/光柱」，柱顶再用 custom 系列贴一枚光点。
 */
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 各区经济收益卡片。
 *
 * - props：无，区名与数值内联在 option 里，换数据需改对应 data。
 * - 响应式依赖：option 是普通对象（仅用 satisfies 做类型检查），不参与响应式追踪。
 * - 生命周期：onMount 建实例并挂 ResizeObserver；onCleanup 先解绑监听再 dispose。
 * - 动画：未显式配置 animation，沿用 ECharts 默认的 1000ms 入场时长与缓出曲线。
 */
export default function DistrictEconomicIncome() {
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
		// 与其它左侧卡片同一套留白：顶部放单位标签与柱顶数字，底部放 x 轴标签
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
				// 阴影保留 0.2 透明度，hover 时给当前类目一条浅色定位带
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
		// 全局调色板兜底；实际颜色由每个数据项的 itemStyle 渐变覆盖
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
					// 强制显示全部五个区名，避免窄容器下 ECharts 自动抽稀
					interval: 0,
					padding: [0, 0, 0, 0],
				},
				data: ["南山区", "天河区", "福田区", "龙岗区", "宝安区"],
			},
			{
				// 空的载体轴：只给 custom 系列提供与类目对齐的坐标系，自身不画任何轴线
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
				// 不画网格线：柱体本身是大面积渐变，再叠横线会显脏
				show: false,
			},
			axisLabel: {
				color: "#8B9EA4",
				fontSize: 9,
			},
		},
		series: [
			{
				// 图形柱：symbol 用 path:// 内联一段 10×10 的水滴轮廓（底宽 10、顶部收成尖点），
				// pictorialBar 会按柱高纵向拉伸它，得到上尖下宽的「光柱」造型
				name: "",
				type: "pictorialBar",
				symbol: "path://M0,10 L10,10 C5.5,10 5.5,5 5,0 C4.5,5 4.5,10 0,10 z",
				label: {
					show: true,
					position: "top",
					// 留 10px 间距给柱顶光点，避免数字压在光点上
					distance: 10,
					color: "#ffffff",
					fontSize: 10,
				},

				// 每项单独配渐变：第 1/3/5 项蓝色、第 2/4 项青绿，形成冷暖交替的节奏
				data: [
					{
						value: 8000,
						itemStyle: {
							// 0,0 → 0,1 为自上而下：柱顶实色、柱底只剩 10% 不透明度，像光从地面升起
							color: new graphic.LinearGradient(0, 0, 0, 1, [
								{ offset: 0, color: "rgba(64, 175, 255, 1)" },
								{ offset: 1, color: "rgba(64, 175, 255, 0.10)" },
							]),
						},
					},
					{
						value: 7500,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 0, 1, [
								{ offset: 0, color: "rgba(25, 255, 198, 1)" },
								{ offset: 1, color: "rgba(0, 204, 187, 0.10)" },
							]),
						},
					},
					{
						value: 6000,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 0, 1, [
								{ offset: 0, color: "rgba(64, 175, 255, 1)" },
								{ offset: 1, color: "rgba(64, 175, 255, 0.10)" },
							]),
						},
					},
					{
						value: 5800,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 0, 1, [
								{ offset: 0, color: "rgba(25, 255, 198, 1)" },
								{ offset: 1, color: "rgba(0, 204, 187, 0.10)" },
							]),
						},
					},
					{
						value: 5000,
						itemStyle: {
							color: new graphic.LinearGradient(0, 0, 0, 1, [
								{ offset: 0, color: "rgba(64, 175, 255, 1)" },
								{ offset: 1, color: "rgba(64, 175, 255, 0.10)" },
							]),
						},
					},
				],
			},
			{
				// 柱顶光点：custom 系列把 10×10 图标贴到 (类目, 数值) 的像素位，
				// z:3 保证盖在柱体之上；挂第二条轴是为了不干扰第一根柱的宽度与间距计算
				name: "",
				type: "custom",
				z: 3,
				xAxisIndex: 1,
				renderItem: (_params, api) => {
					// value(0) 为类目下标、value(1) 为数值，api.coord 把数据坐标换算成画布像素
					const categoryIndex = api.value(0);

					const categoryData = api.value(1);

					const basicsCoord = api.coord([categoryIndex, categoryData]);

					const topBasicsYAxis = basicsCoord[1];

					const basicsXAxis = basicsCoord[0];
					return {
						type: "image",
						style: {
							// 各减 5 即图标宽高的一半，让光点以柱顶为圆心
							x: basicsXAxis - 5,
							y: topBasicsYAxis - 5,
							width: 10,
							height: 10,
							image:
								"data:image/png;base64,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",
						},
					};
				},
				data: [8000, 7500, 6000, 5800, 5000],
			},
		],
	} satisfies EChartsOption;

	/**
	 * 建 ECharts 实例、写入 option，并用 ResizeObserver 跟随卡片尺寸重绘。
	 * @returns 解绑尺寸监听的清理函数；容器 ref 未就绪时返回 undefined，调用方需用 `?.` 兜底。
	 */
	const initChart = () => {
		if (!chartRef) return;

		chartInstance = init(chartRef);
		chartInstance.setOption(option);

		// 自动调整大小
		const resizeObserver = new ResizeObserver(() => {
			// 卸载瞬间可能仍有一次回调，用可选链避免操作已销毁的实例
			chartInstance?.resize();
		});

		resizeObserver.observe(chartRef);

		return () => {
			resizeObserver.disconnect();
		};
	};

	/** 销毁实例并清空引用；置 null 后重复调用不会二次 dispose。 */
	const disposeChart = () => {
		if (chartInstance) {
			chartInstance.dispose();
			chartInstance = null;
		}
	};

	onMount(() => {
		const cleanupResize = initChart();

		// 先解绑 ResizeObserver 再 dispose：否则容器变化仍会回调到已销毁的实例
		onCleanup(() => {
			cleanupResize?.();
			disposeChart();
		});
	});

	// class 里的 -translate-x-[150%] 与 opacity-0 是入场初始态，
	// 由 map-3d.ts 的 GSAP 时间线按 #left-card 选择器补间回 x:0 / opacity:1
	return (
		<div
			id="left-card"
			class="tw:flex-1 tw:mb-3 tw:-translate-x-[150%] tw:opacity-0"
		>
			<Card title="各区经济收益">
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

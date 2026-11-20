/**
 * 大宗商品销售额：按品类（农产品 / 能源 / 金属 / 化工 / 木材）对比销售额的柱状图。
 * 被重庆、广东两套大屏的左侧栏复用（screens/chongqing、screens/guangdong），
 * 数值为示例数据，单位为亿元（100~150 亿元量级）。
 */
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { createSignal, onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 大宗商品销售额卡片。
 *
 * - props：无。品类与数值全部内联在此组件，替换数据需改下方 option。
 * - 响应式依赖：option 用 createSignal 包了一层但不订阅，只取初始值；如需动态换数，
 *   可启用文件末尾被注释的 createEffect，以 setOption(option(), true) 整体替换。
 * - 生命周期：onMount 建实例并挂 ResizeObserver；onCleanup 先解绑尺寸监听再 dispose。
 */
export default function BulkCommoditySales() {
	/** 图表挂载点，由 JSX 的 ref 赋值；未挂载时为 undefined，init 前需判空 */
	let chartRef: HTMLDivElement | undefined;
	/** ECharts 实例句柄，dispose 后置回 null，防止重复销毁 */
	let chartInstance: ECharts | null = null;

	// 使用 createSignal 如果需要响应式更新 option
	const [option] = createSignal<EChartsOption>({
		// 左上角单位标签：图表不画轴标题，借 title 把「亿元」放到 grid 上方的空白处
		title: {
			text: "亿元",
			left: "5%",
			top: "8%",
			textStyle: {
				color: "#D3F8F2",
				fontSize: 8,
			},
		},
		// 绘图区留白：top 25% 给单位标签与柱顶数字，height 55% 让底部空出 x 轴标签与卡片内边距
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
				// 阴影指示器透明化：只要 tooltip 气泡，不要默认的灰色方块压住细柱
				shadowStyle: { opacity: 0 },
			},
			backgroundColor: "rgba(0,0,0,1)",
			borderWidth: 1,
			borderColor: "#ffffff",
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
					// interval 0 强制五个品类名全部显示，否则窄容器下 ECharts 会隔一个隐藏
					interval: 0,
					padding: [0, 0, 0, 0],
				},
				data: ["农产品", "能源", "金属", "化工", "木材"],
			},
			{
				// 第二条类目轴只作坐标系载体，供 custom 系列（柱顶圆点）与底板柱使用；
				// 轴数据为空、轴线透明，因此不占额外视觉空间
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
					// [2, 2] 表示 2px 实线、2px 空白交替；width 0.3 让网格线足够淡，不抢柱体
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
				// 主柱：单系列，stack 目前不产生堆叠效果，保留是为了后续追加同栈系列时自动叠高
				name: "",
				data: [100, 120, 150, 110, 100],
				type: "bar",
				// 4px 细柱是设计稿的「能量条」造型，靠后面的宽底板补出体量感
				barWidth: 4,
				stack: "b",
				z: 3,
				yAxisIndex: 0,
				showBackground: false,
				backgroundStyle: {
					color: "rgba(180, 180, 180, 0.2)",
				},
				label: {
					show: true,
					position: "top",
					// 柱顶还要贴一个 10px 圆点，distance 15 让数值落在圆点上方不重叠
					distance: 15,
					color: "#ffffff",
					fontSize: 10,
				},
				itemStyle: {
					borderRadius: 2,
					// 0,0 → 0,1 表示自上而下渐变：柱顶亮青绿、柱底转蓝，制造由实到虚的观感
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{ offset: 0, color: "#19FFC6" },
						{ offset: 1, color: "#33AAFF" },
					]),
				},
			},
			{
				// 柱顶圆点：用 custom 系列把一张 10×10 的圆点贴图贴到 (类目, 数值) 对应的像素位，
				// 比 symbol 更可控，也避免影响主柱的 symbol 设置
				type: "custom",
				// _params 是 ECharts 传入的渲染参数，这里只用到 api 做数据坐标到像素的换算
				renderItem: (_params, api) => {
					// value(0) 是类目下标，value(1) 是数值；api.coord 把数据坐标换算成画布像素
					const categoryIndex = api.value(0);
					const categoryData = api.value(1);
					const basicsCoord = api.coord([categoryIndex, categoryData]);
					const topBasicsYAxis = basicsCoord[1];
					const basicsXAxis = basicsCoord[0];

					return {
						type: "image",
						style: {
							// x 左移 4.5（约半个宽）、y 上移 9（几乎整个高）：横向大致居中，
							// 纵向让图标底边贴在柱顶上方约 1px，是「悬浮在柱顶」而不是以柱顶为中心
							x: basicsXAxis - 4.5,
							y: topBasicsYAxis - 9,
							width: 10,
							height: 10,
							image:
								"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAAXNSR0IArs4c6QAAAL1JREFUOE9j/P///38GMgAjSKOMdxRJWp9sXcYA18giJMLw99MHhv9//mA1hJGZhYGZX4Dhz7s3DCgaGVlYGDjVtBi+37rO8P/PbxTNjCysDJyqWgzfb18Dy6FoBKmEKfh17wZcM0iMTUkDrgmkDkMjSJCFnZ3hwbr5KDYqBCUy/Pn5Ey6GVSMzMxPDw01LUDTK+8Uw/P37j0YayXIqWYGDHuTInsQbHeAE8PEDw/+/JCYAUtIcPDpI0QRTCwDhurXXJ/EmUwAAAABJRU5ErkJggg==",
						},
					};
				},
				// 改用第二条类目轴，与主柱解耦，圆点不参与柱宽与间距计算
				xAxisIndex: 1,
				data: [100, 120, 150, 110, 100],
			},
			{
				// 底板柱：32px 宽、半透明，充当主柱的「凹槽」；
				// barGap 取负值让它与 4px 主柱叠在同一类目中心，而不是并排
				type: "bar",
				barWidth: 32,
				xAxisIndex: 1,
				barGap: "-220%",
				// 固定 150 与数据峰值对齐，使凹槽顶部齐平 y 轴上限
				data: [150, 150, 150, 150, 150],
				emphasis: {
					// 关闭「高亮时淡化其他系列」，否则 hover 会整片底板忽明忽暗
					focus: "none",
					itemStyle: { color: "rgba(255,255,255,0.8)" },
				},
				itemStyle: {
					color: "rgba(122,140,153,0.6)",
					opacity: 0.1,
				},
				z: 0,
			},
		],
	});

	/**
	 * 建 ECharts 实例、写入 option，并监听容器尺寸变化自动 resize。
	 * @returns 解绑 ResizeObserver 的清理函数；容器 ref 尚未就绪时返回 undefined，调用方需用 `?.` 兜底。
	 */
	const initChart = () => {
		if (!chartRef) return;

		chartInstance = init(chartRef);
		chartInstance.setOption(option());

		// 自动调整大小
		const resizeObserver = new ResizeObserver(() => {
			// 用可选链兜底：卸载瞬间仍可能收到一次尺寸回调，此时实例已被 dispose
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

		// 顺序不能颠倒：先断开 ResizeObserver 再 dispose，
		// 否则容器收缩仍会回调到已销毁的实例，报 “instance has been disposed”
		onCleanup(() => {
			cleanupResize?.();
			disposeChart();
		});
	});

	// 如果需要响应式更新 option，使用 createEffect
	// createEffect(() => {
	//   chartInstance?.setOption(option(), true);
	// });

	// 外层 class 里的 -translate-x-[150%] 与 opacity-0 是入场前的初始态，
	// 由 map-3d.ts 的 GSAP 时间线按 #left-card 选择器补间回 x:0 / opacity:1
	return (
		<div
			id="left-card"
			class="tw:flex-1 tw:mb-3 tw:-translate-x-[150%] tw:opacity-0"
		>
			<Card title="大宗商品销售额">
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

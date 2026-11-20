/**
 * 人群消费占比：环形饼图 + 右侧百分比图例，展示四类人群的消费占比。
 * 被重庆、广东两套大屏的右侧栏复用（screens/chongqing、screens/guangdong），
 * 数值为示例数据，单位为百分比（四项合计 100）。
 */

import { cn } from "cn";
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 人群消费占比卡片。
 *
 * - props：无，占比数据内联，单位为 %。
 * - 数据重复：图例由 pieData 渲染、扇区由 option.series[0].data 渲染，改占比需两处同步。
 * - 响应式依赖：option 是普通对象，仅用 satisfies 做类型检查，不参与响应式追踪。
 * - 生命周期：onMount 建实例并挂 ResizeObserver；onCleanup 先解绑监听再 dispose。
 * - 动画：未显式配置，沿用 ECharts 默认的 1000ms 入场动画。
 */
export default function ProportionPopulationConsumption() {
	/** 图例圆点的描边色，按下标取；与扇区自身的渐变配色是两套，改一处不会联动另一处 */
	const pieDataColor = ["#17E6C3", "#40CFFF", "#1979FF", "#FFC472"];
	/** 右侧图例数据：value 为百分比数值（不含 % 号，% 由 JSX 单独渲染） */
	const pieData = [
		{ name: "类型1", value: 40 },
		{ name: "类型2", value: 25 },
		{ name: "类型3", value: 20 },
		{ name: "类型4", value: 15 },
	];

	/** 图表挂载点，由 JSX 的 ref 赋值 */
	let chartRef: HTMLDivElement | undefined;
	/** ECharts 实例句柄，dispose 后置回 null 防止重复销毁 */
	let chartInstance: ECharts | null = null;

	const option = {
		tooltip: {
			// 与其它卡片统一写 axis；饼图没有真实坐标轴，实际仍按扇区触发，
			// 把 axisPointer 的阴影透明度置 0，避免出现多余的指示器方块
			trigger: "axis",
			axisPointer: {
				type: "shadow",
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

		series: [
			{
				name: "",
				type: "pie",
				itemStyle: {
					// 用与卡片底色一致的描边把相邻扇区隔开，形成 5px 缝隙而非留白
					borderWidth: 5,
					borderColor: "rgba(26, 57, 77,1)",
				},
				// 扇区文字关闭：占比文案改由右侧图例与环心文字承担，开启会与环心文字撞在一起
				label: { show: false },
				// 内径 55% 让出环心放「消费占比」四字，外径 70% 控制环宽约 15%
				radius: ["55%", "70%"],
				// 扇区颜色兜底池，实际被下面每项的 itemStyle 渐变覆盖
				color: [
					"#c487ee",
					"#deb140",
					"#49dff0",
					"#034079",
					"#6f81da",
					"#00ffb4",
				],

				data: [
					{
						value: 40,
						name: "类型1",
						itemStyle: {
							//颜色渐变
							// 0,0 → 1,1 为左上到右下，扇区内形成明暗过渡，避免整块纯色
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(3,65,128,1)" },
								{ offset: 1, color: "rgba(115,208,255,1)" },
							]),
						},
					},
					{
						value: 25,
						name: "类型2",
						itemStyle: {
							//颜色渐变
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(11, 77, 44, 1)" },
								{ offset: 1, color: "rgba(77, 255, 181, 1)" },
							]),
						},
					},
					{
						value: 20,
						name: "类型3",
						itemStyle: {
							//颜色渐变
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(117, 117, 117, 1)" },
								{ offset: 1, color: "rgba(230, 230, 230, 1)" },
							]),
						},
					},
					{
						value: 15,
						name: "类型4",
						itemStyle: {
							//颜色渐变
							color: new graphic.LinearGradient(0, 0, 1, 1, [
								{ offset: 0, color: "rgba(153, 105, 38, 1)" },
								{ offset: 1, color: "rgba(255, 200, 89, 1)" },
							]),
						},
					},
				],
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

	// 布局分两栏：左侧环形图容器带贴图底纹（pie-zs-bg.png），其 ::after 伪元素再做一层
	// 2s 匀速无限旋转的小图作为动效；右侧图例由 pieData 渲染，圆点描边色取自 pieDataColor。
	// 环心的「消费占比」文案用绝对定位居中叠在画布上，因此饼图自身的 label 关闭。
	return (
		<div
			id="right-card"
			class="tw:flex-1 tw:mb-3 tw:translate-x-[150%] tw:opacity-0"
		>
			<Card title="人群消费占比">
				<div class="tw:flex tw:h-full">
					<div
						class={cn(
							"tw:relative tw:w-45 tw:h-full tw:ml-4",
							"tw:bg-[url(/assets/images/pie/pie-zs-bg.png)] tw:bg-no-repeat tw:bg-cover",
							"tw:after:content-['']",
							"tw:after:absolute tw:after:left-1/2 tw:after:top-1/2",
							"tw:after:-translate-1/2",
							"tw:after:-z-1 tw:after:size-18",
							"tw:after:bg-[url(/assets/images/pie/pie-zs-bg.png)] tw:after:bg-no-repeat",
							"tw:after:bg-contain tw:after:bg-center",
							"tw:after:animate-[rotate360Animate_2s_linear_infinite]",
						)}
					>
						<div ref={chartRef} class="tw:size-full" />
						<div
							class={cn(
								"tw:absolute tw:left-1/2 tw:top-1/2",
								"tw:-translate-1/2",
								"tw:size-18",
								"tw:flex tw:items-center tw:justify-center",
								"tw:text-xs tw:text-[#c4e3fd]",
							)}
						>
							消费占比
						</div>
					</div>
					<div class={cn(
						"tw:flex tw:flex-col tw:justify-between tw:items-center tw:flex-wrap",
						"tw:pl-8 tw:py-5"
					)}>
						{pieData.map((item, idx) => (
							<div class="tw:flex tw:items-center tw:flex-nowrap tw:box-border">
								<div
									class={cn(
										"tw:size-2.5 tw:rounded-full",
										"tw:border-2 tw:border-solid tw:border-[#17e6c3]",
										"tw:box-border tw:mr-2",
									)}
									style={{ "border-color": pieDataColor[idx] }}
								></div>
								<div class="tw:font-medium tw:text-xs tw:text-white">
									{item.name}
								</div>
								<div
									class={cn(
										"tw:flex tw:flex-nowrap tw:justify-end tw:items-center",
										"tw:w-20 tw:text-right",
										"tw:font-bold tw:text-white tw:font-d-din tw:text-base",
									)}
								>
									{item.value}
									<span class={cn(
										"tw:font-d-din tw:font-normal tw:text-xxs",
										"tw:opacity-50 tw:pl-2.5"
									)}>
										%
									</span>
								</div>
							</div>
						))}
					</div>
				</div>
			</Card>
		</div>
	);
}

import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";
import { cn } from "../utils/cn";

export default function ProportionPopulationConsumption() {
	const pieDataColor = ["#17E6C3", "#40CFFF", "#1979FF", "#FFC472"];
	const pieData = [
		{ name: "类型1", value: 40 },
		{ name: "类型2", value: 25 },
		{ name: "类型3", value: 20 },
		{ name: "类型4", value: 15 },
	];

	let chartRef: HTMLDivElement | undefined;
	let chartInstance: ECharts | null = null;

	const option = {
		tooltip: {
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
					borderWidth: 5,
					borderColor: "rgba(26, 57, 77,1)",
				},
				label: { show: false },
				radius: ["55%", "70%"],
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

	const initChart = () => {
		if (!chartRef) return;

		chartInstance = init(chartRef);
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

	const disposeChart = () => {
		if (chartInstance) {
			chartInstance.dispose();
			chartInstance = null;
		}
	};

	onMount(() => {
		const cleanupResize = initChart();

		onCleanup(() => {
			cleanupResize?.();
			disposeChart();
		});
	});

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

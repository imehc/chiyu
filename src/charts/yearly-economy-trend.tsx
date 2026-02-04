import Card from "../componnets/card";
import StatisticalCount from "../layouts/statistical-count";
import { cn } from "../utils/cn";
import PieChart from "./pie";

export default function YearlyEconomyTrend() {
	const pieDataColor = ["#17E6C3", "#40CFFF", "#1979FF", "#FFC472"];
	const pieData = [
		{ name: "类型1", value: 400 },
		{ name: "类型2", value: 250 },
		{ name: "类型3", value: 200 },
		{ name: "类型4", value: 150 },
	];
	return (
		<div
			id="left-card"
			class="tw:flex-1 tw:mb-3 tw:-translate-x-[150%] tw:opacity-0"
		>
			<Card title="年度经济增长点">
				<div class="tw:size-full tw:flex">
					<div class="tw:pointer-events-auto tw:relative tw:w-59 tw:h-full">
						<PieChart
							data={pieData}
							colors={pieDataColor}
							delay={3000}
							opacity={0.6}
							class="tw:size-full tw:pointer-events-auto"
						>
							{({ name, value, count }) => (
								<div
									class={cn(
										"tw:size-full tw:mb-7.5 tw:text-white tw:text-xs",
										"tw:flex tw:flex-col tw:justify-center tw:items-center",
									)}
								>
									<div class="tw:text-base tw:font-bold tw:[text-shadow:0px_0px_10px_#000]">
										<StatisticalCount
											startVal={0}
											endVal={Number(((value / count) * 100).toFixed(2))}
											decimals={2}
											duration={1000}
											autoplay
										/>
										%
									</div>
									<div
										class={cn(
											"tw:w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
											"tw:text-white tw:text-center",
										)}
									>
										{name}
									</div>
								</div>
							)}
						</PieChart>
					</div>
					<div class="tw:flex tw:flex-col tw:justify-between tw:items-center tw:flex-wrap tw:py-5">
						{pieData.map((item, idx) => (
							<div class="tw:flex tw:items-center tw:flex-nowrap tw:box-border">
								<div
									class={cn(
										"tw:size-2.5 tw:rounded-full tw:mr-2.5 tw:box-border",
										"tw:border-2 tw:border-solid tw:border-[#17e6c3]",
									)}
									style={{ "border-color": pieDataColor[idx] }}
								></div>
								<div class="tw:font-medium tw:text-xs tw:text-white">
									{item.name}
								</div>
								<div
									class={cn(
										"tw:flex tw:flex-nowrap tw:items-center tw:justify-end",
										"tw:w-20 tw:text-right tw:font-bold tw:text-white",
										"tw:text-base tw:font-d-din",
									)}
								>
									{item.value}
									<span
										class={cn(
											"tw:font-d-din tw:font-normal tw:text-xxs tw:opacity-50 tw:pl-2.5",
										)}
									>
										亿
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

/**
 * 年度经济增长点：左侧 3D 环形饼图 + 右侧图例，环心随轮播显示当前类型的占比。
 * 被重庆、广东两套大屏的左侧栏复用（screens/chongqing、screens/guangdong），
 * 数值为示例数据，单位为亿元（150~400 亿元量级，四项合计 1000 亿元）。
 */

import { cn } from "cn";
import Card from "../componnets/card";
import StatisticalCount from "../layouts/statistical-count";
import PieChart from "./pie";

/**
 * 年度经济增长点卡片。
 *
 * - props：无，数据与配色内联；pieData 同时供饼图与右侧图例使用，改数只需改这一处。
 * - 依赖：PieChart（Three.js 3D 饼图，内部自管实例）与 StatisticalCount（数字滚动）。
 * - 生命周期：本组件不持有任何渲染实例，创建与销毁都由 PieChart 的 onMount / onCleanup 完成，
 *   因此这里没有 onMount / onCleanup，只负责数据、布局与文案。
 * - 百分比：环心数值为 value / count × 100，count 是四项 value 之和。
 */
export default function YearlyEconomyTrend() {
	/** 图例圆点描边色，同时作为 PieChart 的扇区配色池传入（colors prop） */
	const pieDataColor = ["#17E6C3", "#40CFFF", "#1979FF", "#FFC472"];
	/** 四类增长点：value 单位为亿元，合计 1000 亿元 */
	const pieData = [
		{ name: "类型1", value: 400 },
		{ name: "类型2", value: 250 },
		{ name: "类型3", value: 200 },
		{ name: "类型4", value: 150 },
	];
	// 布局说明：左列固定 236px（w-59，即 14.75rem）放 3D 饼图，右列是纵向均分的图例。
	// PieChart 的几个关键入参：
	// - delay 3000：每个扇区停留 3s（默认 5000），贴合大屏轮播节奏；
	// - opacity 0.6：非高亮扇区的基础透明度，高亮块由 Pie 内部补间到 0.8；
	// - class 上的 pointer-events-auto：PieChart 内部默认给遮罩层 pointer-events-none，
	//   这里显式恢复，让鼠标事件落到饼图 canvas 上（当前控制器保持禁用，暂不可拖拽）。
	// 子节点是渲染函数，入参除当前扇区数据外还带 count（总和），用于实时算占比。
	// 外层 class 的 translate/opacity 是入场初始态，由 map-3d.ts 按 #left-card 补间复位。
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
								// 占比 = 当前扇区值 / 总和 × 100，先 toFixed(2) 再转回 number，
								// 保证滚动计数器按两位小数对齐，不出现 33.333333 这类长尾
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

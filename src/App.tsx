import autofit from "autofit.js";
import { type Component, createSignal, onCleanup, onMount } from "solid-js";
import Map3D, { type Map3DState } from "./helper/map";
import "./css/map.css";
import "./css/home.css";
import "./css/scene.css";
import { createStore } from "solid-js/store";
import BulkCommoditySales from "./charts/bulk-commodity-sales";
import DistrictEconomicIncome from "./charts/district-economic-income";
import EconomicTrend from "./charts/economic-trend";
import ElectricityUsage from "./charts/electricity-usage";
import ProportionPopulationConsumption from "./charts/proportion-population-consumption";
import PurposeSpecialFunds from "./charts/purpose-special-funds";
import QuarterlyGrowthSituation from "./charts/quarterly-growth-situation";
import Radar from "./charts/radar";
import YearlyEconomyTrend from "./charts/yearly-economy-trend";
import SvgLineAnimation from "./componnets/svg-line-animation";
import Header from "./layouts/header";
import Menu from "./layouts/menu";
import { MenuItem } from "./layouts/menu/menu-item";
import StatisticalCard from "./layouts/statistical-card";
import { cn } from "./utils/cn";

const App: Component = () => {
	let containerRef!: HTMLDivElement;
	let el!: HTMLCanvasElement;
	const [map3d, setMap3d] = createSignal<Map3D>();
	const [state, setState] = createStore<Map3DState>({
		progress: 0,
		activeIndex: "1",
		statisticalCards: [
			{
				icon: "xiaoshoujine",
				zhLabel: "2024年生产总值",
				enLabel: "Gross Domestic Product in 2024",
				value: 31500,
				unit: "亿元",
			},
			{
				icon: "zongxiaoliang",
				zhLabel: "2024年常驻人数",
				enLabel: "resident population in 2024",
				value: 15000,
				unit: "万人",
			},
		],
	});

	onMount(() => {
		autofit.init({
			dh: 1080,
			dw: 1920,
			el: "#large-screen",
			resize: true,
		});
		const map = new Map3D({ el });
		map.initAssets(
			async () => {
				await map.hideLoading();
				map.play();
			},
			(progress) => {
				setState("progress", progress);
			},
		);
		setMap3d(map);
	});

	function handleMenuSelect(index: string | number) {
		setState("activeIndex", index);
	}

	onCleanup(() => {
		map3d()?.destroy();
	});

	return (
		<div
			class={cn(
				"tw:w-full tw:h-screen tw:bg-black tw:z-1",
				"tw:relative tw:top-0 tw:right-0 tw:bottom-0 tw:left-0",
			)}
			ref={containerRef}
		>
			<canvas class="tw:size-full" ref={el}></canvas>
			<div class="large-screen-wrap" id="large-screen">
				{/* 顶部菜单 */}
				<Header
					title="广东省数据可视化平台"
					subText="Guangdong Economic Visualization Platform"
					leftChindren={
						<div class="m-header-weather leading-none">
							<span>小雨</span>
							<span>27℃</span>
						</div>
					}
					rightChindren={
						<div class="m-header-date leading-none">
							<span>2023-10-12</span>
							<span>17:53:16</span>
						</div>
					}
				/>
				<div id="top-menu" class="top-menu">
					<Menu defaultActive={state.activeIndex} onSelect={handleMenuSelect}>
						<MenuItem index="1">经济概览</MenuItem>
						<MenuItem index="2">导航栏</MenuItem>
						<MenuItem index="3">导航栏</MenuItem>
						<div class="top-menu-mid-space"></div>
						<MenuItem index="4">导航栏</MenuItem>
						<MenuItem index="5">导航栏</MenuItem>
						<MenuItem index="6">导航栏</MenuItem>
					</Menu>
				</div>
				{/* 顶部统计卡片 */}
				<div class="top-count-card">
					{state.statisticalCards.map((item) => (
						<StatisticalCard {...item} />
					))}
				</div>
				{/* 左边布局 图表 */}
				<div class="left-wrap">
					<div class="left-wrap-3d">
						{/* 大宗商品销售额 */}
						<BulkCommoditySales />
						{/* 年度经济增长点 */}
						<YearlyEconomyTrend />
						{/* 近年经济情况 */}
						<EconomicTrend />
						{/* 各区经济收益 */}
						<DistrictEconomicIncome />
					</div>
				</div>
				{/* 右边布局 图表 */}
				<div class="right-wrap">
					<div class="right-wrap-3d">
						{/* 专项资金用途 */}
						<PurposeSpecialFunds />
						{/* 人群消费占比 */}
						<ProportionPopulationConsumption />
						{/* 用电情况 */}
						<ElectricityUsage />
						{/* 各季度增长情况 */}
						<QuarterlyGrowthSituation />
					</div>
				</div>
				{/* 底部托盘 */}
				<div id="bottom-tray" class="bottom-tray">
					{/* svg线条动画 */}
					<SvgLineAnimation
						class="bottom-svg-line-left"
						width={721}
						height={57}
						color="#30DCFF"
						strokeWidth={2}
						dir={[0, 1]}
						length={50}
						path="M1 56.6105C1 31.5123 185.586 10.0503 451.904 1.35519C458.942 1.12543 465.781 4.00883 470.505 9.22964L484.991 25.2383C487.971 28.4775 492.938 30.4201 498.254 30.4201H720.142"
					/>
					<SvgLineAnimation
						class="bottom-svg-line-left bottom-svg-line-right"
						width={721}
						height={57}
						color="#30DCFF"
						strokeWidth={2}
						dir={[0, 1]}
						length={50}
						path="M1 56.6105C1 31.5123 185.586 10.0503 451.904 1.35519C458.942 1.12543 465.781 4.00883 470.505 9.22964L484.991 25.2383C487.971 28.4775 492.938 30.4201 498.254 30.4201H720.142"
					/>
					{/* 做箭头 */}
					<div class="bottom-tray-arrow">
						<img src="/assets/images/bottom-menu-arrow-big.svg" alt="" />
						<img src="/assets/images/bottom-menu-arrow-small.svg" alt="" />
					</div>
					{/* 底部菜单 */}
					<div class="bottom-menu">
						<div class="bottom-menu-item is-active">
							<span>人口概览</span>
						</div>
						<div class="bottom-menu-item">
							<span>小标题</span>
						</div>
						<div class="bottom-menu-item">
							<span>小标题</span>
						</div>
						<div class="bottom-menu-item">
							<span>小标题</span>
						</div>
					</div>
					{/* 右箭头 */}
					<div class="bottom-tray-arrow is-reverse">
						<img src="/assets/images/bottom-menu-arrow-big.svg" alt="" />
						<img src="/assets/images/bottom-menu-arrow-small.svg" alt="" />
					</div>
				</div>
				{/* 雷达 */}
				<div id="bottom-radar" class="bottom-radar">
					<Radar />
				</div>
				{/* 左右装饰线 */}
				<div class="large-screen-left-zsline"></div>
				<div class="large-screen-right-zsline"></div>
				{/* loading动画 */}
				<div id="loading" class="loading">
					<div id="loading-text" class="loading-text">
						<span style="--index: 1">L</span>
						<span style="--index: 2">O</span>
						<span style="--index: 3">A</span>
						<span style="--index: 4">D</span>
						<span style="--index: 5">I</span>
						<span style="--index: 6">N</span>
						<span style="--index: 7">G</span>
					</div>
					<div id="loading-progress" class="loading-progress">
						<span class="value">{state.progress}</span>
						<span class="unit">%</span>
					</div>
				</div>
			</div>
		</div>
	);
};

export default App;

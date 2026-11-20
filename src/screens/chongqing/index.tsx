/**
 * 重庆市大屏页面骨架：负责等比缩放、3D 地图挂载与 UI 布局。
 * 通过 ./config 提供资源清单与统计卡数据，通过 ./world 提供场景编排；
 * 由 src/screens/registry.ts 以懒加载方式注册为大屏路由。
 */
import autofit from "autofit.js";
import { cn } from "cn";
import { type Component, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import BulkCommoditySales from "../../charts/bulk-commodity-sales";
import DistrictEconomicIncome from "../../charts/district-economic-income";
import EconomicTrend from "../../charts/economic-trend";
import ElectricityUsage from "../../charts/electricity-usage";
import ProportionPopulationConsumption from "../../charts/proportion-population-consumption";
import PurposeSpecialFunds from "../../charts/purpose-special-funds";
import QuarterlyGrowthSituation from "../../charts/quarterly-growth-situation";
import Radar from "../../charts/radar";
import YearlyEconomyTrend from "../../charts/yearly-economy-trend";
import CurrentTime from "../../componnets/current-time";
import SvgLineAnimation from "../../componnets/svg-line-animation";
import Weather from "../../componnets/weather";
import Bottom from "../../layouts/bottom";
import Header from "../../layouts/header";
import Menu from "../../layouts/menu";
import { MenuItem } from "../../layouts/menu/menu-item";
import StatisticalCard, {
	type Statistical,
} from "../../layouts/statistical-card";
import Map3D from "../../shared/map/map-3d";
import { chongqingAssets, chongqingStatisticalCards } from "./config";
import ChongqingWorld from "./world";

/** 页面级响应式状态：加载进度、顶部菜单选中项与统计卡列表 */
interface ChongqingScreenState {
	/** GeoJSON / 贴图加载百分比，0~100，直接显示在 loading 层上 */
	progress: number;
	/** 顶部菜单选中项，对应 MenuItem 的 index，默认停在「经济概览」 */
	activeIndex: string | number;
	/** 顶部统计卡数据，来源于 ./config */
	statisticalCards: Statistical[];
}

/**
 * 重庆市数据可视化大屏。
 *
 * 布局分三层：全屏 canvas 铺底渲染 3D 场景；`#chongqing-large-screen`
 * 作为 1920×1080 的设计画布承载所有 DOM 面板（顶栏、菜单、左右图表列、底部托盘、
 * 底部雷达、左右装饰线与 loading 遮罩），层级由 z-index 控制；
 * 遮罩层整体 pointer-events-none，避免透明区域拦截 canvas 的鼠标拾取。
 *
 * 生命周期：onMount 中先启动 autofit，再 new Map3D 并 initAssets；
 * 资源加载完成后 hideLoading + play 触发 3D 入场，随后由 Map3D 播放 UI 入场；
 * onCleanup 中销毁场景并解绑 autofit，避免路由切换后残留定时器与缩放监听。
 */
const ChongqingScreen: Component = () => {
	let containerRef!: HTMLDivElement;
	let el!: HTMLCanvasElement;
	/** 场景实例；initAssets 之前为空，销毁后不再使用 */
	const [map3d, setMap3d] = createSignal<Map3D>();
	const [state, setState] = createStore<ChongqingScreenState>({
		progress: 0,
		activeIndex: "1",
		statisticalCards: chongqingStatisticalCards,
	});

	onMount(() => {
		// 以 1920×1080 为设计稿，autofit 用 transform 等比缩放到当前视口，
		// resize: true 让窗口变化时重新计算，因此内部一律按 px 写死尺寸
		autofit.init({
			dh: 1080,
			dw: 1920,
			el: "#chongqing-large-screen",
			resize: true,
		});
		const map = new Map3D({
			el,
			root: containerRef,
			world: ChongqingWorld,
			assets: chongqingAssets,
		});
		// 资源就绪后再播放：先淡出 loading，再启动 world 的入场时间轴
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
		// 顺序不可颠倒：先销毁场景释放 WebGL 资源与定时器，再解除 autofit 监听
		map3d()?.destroy();
		autofit.off("#chongqing-large-screen");
	});

	// #top-menu、#bottom-tray、#bottom-radar 的初始位移与透明由这里的内联 class 给出，
	// Map3D 的 UI 时间轴按 id 查找到它们后补回原位；loading 层同理按 id 淡出。
	// 左右图表列用 perspective + rotate-y 做出向中心收拢的假 3D 倾斜。
	return (
		<div
			class={cn(
				"tw:w-full tw:h-screen tw:bg-black tw:z-1",
				"tw:relative tw:top-0 tw:right-0 tw:bottom-0 tw:left-0",
			)}
			ref={containerRef}
		>
			<canvas class="tw:relative tw:size-full tw:z-2" ref={el}></canvas>
			<div
				class={cn(
					"tw:absolute tw:top-0 tw:left-0 tw:right-0 tw:bottom-0",
					"tw:z-3 tw:pointer-events-none",
					"tw:after:content-[''] tw:after:block",
					"tw:after:absolute tw:after:left-0 tw:after:top-0 tw:after:right-0 tw:after:bottom-0",
					"tw:after:z-1 tw:after:opacity-50",
					"tw:after:bg-[url(/assets/images/bg.png)]",
					"tw:after:bg-no-repeat tw:after:bg-cover",
				)}
				id="chongqing-large-screen"
			>
				{/* 顶部菜单 */}
				<Header
					title="重庆市数据可视化平台"
					subText="Chongqing Economic Visualization Platform"
					leftChindren={<Weather />}
					rightChindren={<CurrentTime />}
				/>
				<div
					id="top-menu"
					class={cn(
						"tw:absolute tw:left-0 tw:right-0 tw:top-10 tw:z-3",
						"tw:flex tw:justify-center",
						"tw:opacity-0 tw:-translate-y-full",
					)}
				>
					<Menu defaultActive={state.activeIndex} onSelect={handleMenuSelect}>
						<MenuItem index="1">经济概览</MenuItem>
						<MenuItem index="2">导航栏</MenuItem>
						<MenuItem index="3">导航栏</MenuItem>
						<div class="tw:w-200"></div>
						<MenuItem index="4">导航栏</MenuItem>
						<MenuItem index="5">导航栏</MenuItem>
						<MenuItem index="6">导航栏</MenuItem>
					</Menu>
				</div>
				{/* 顶部统计卡片 */}
				<div
					class={cn(
						"tw:absolute tw:top-32 tw:left-140 tw:right-140",
						"tw:flex tw:justify-center tw:z-9",
					)}
				>
					{state.statisticalCards.map((item) => (
						<StatisticalCard {...item} />
					))}
				</div>
				{/* 左边布局 图表 */}
				<div
					class={cn(
						"tw:w-100 tw:absolute tw:left-8 tw:top-32 tw:bottom-12",
						"tw:z-4 tw:perspective-[500px] tw:perspective-origin-center",
					)}
				>
					<div
						class={cn(
							"tw:absolute tw:left-0 tw:top-0 tw:right-0 tw:bottom-0",
							"tw:flex tw:flex-col tw:z-4 tw:rotate-y-6",
						)}
					>
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
				<div
					class={cn(
						"tw:w-100 tw:absolute tw:right-8 tw:top-32 tw:bottom-12",
						"tw:z-4 tw:perspective-[500px] tw:perspective-origin-center",
					)}
				>
					<div
						class={cn(
							"tw:absolute tw:left-0 tw:top-0 tw:right-0 tw:bottom-0",
							"tw:flex tw:flex-col tw:z-4 tw:-rotate-y-6",
						)}
					>
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
				<div
					id="bottom-tray"
					class={cn(
						"tw:absolute tw:left-1/2 tw:bottom-0",
						"tw:z-3 tw:-ml-240 tw:w-480 tw:h-22",
						"tw:flex tw:justify-center",
						"tw:bg-[url(/assets/images/bottom-menu-bg.png)]",
						"tw:bg-no-repeat tw:bg-contain",
						"tw:translate-y-full tw:opacity-0",
					)}
				>
					{/* svg线条动画 */}
					<SvgLineAnimation
						class="tw:absolute tw:right-1/2 tw:-bottom-5 tw:-translate-x-3 tw:w-176 tw:h-13.5"
						width={721}
						height={57}
						color="#30DCFF"
						strokeWidth={2}
						dir={[0, 1]}
						length={50}
						path="M1 56.6105C1 31.5123 185.586 10.0503 451.904 1.35519C458.942 1.12543 465.781 4.00883 470.505 9.22964L484.991 25.2383C487.971 28.4775 492.938 30.4201 498.254 30.4201H720.142"
					/>
					<SvgLineAnimation
						class="tw:-scale-x-100 tw:absolute tw:left-1/2 tw:-bottom-5 tw:-translate-x-7 tw:w-176 tw:h-13.5"
						width={721}
						height={57}
						color="#30DCFF"
						strokeWidth={2}
						dir={[0, 1]}
						length={50}
						path="M1 56.6105C1 31.5123 185.586 10.0503 451.904 1.35519C458.942 1.12543 465.781 4.00883 470.505 9.22964L484.991 25.2383C487.971 28.4775 492.938 30.4201 498.254 30.4201H720.142"
					/>
					{/* 左箭头 */}
					<div class="tw:flex tw:items-center tw:h-8">
						<img
							src="/assets/images/bottom-menu-arrow-big.svg"
							alt=""
							class="tw:animate-[arrowAnimate_2s_ease-in-out_infinite]"
						/>
						<img
							src="/assets/images/bottom-menu-arrow-small.svg"
							alt=""
							class="tw:animate-[arrowAnimate2_2s_ease-in-out_infinite]"
						/>
					</div>
					{/* 底部菜单 */}
					<div class="tw:flex tw:px-5">
						{new Array(4).fill(0).map((_, idx) => (
							<Bottom title="小标题" isActive={idx === 0} />
						))}
					</div>
					{/* 右箭头 */}
					<div class="tw:flex tw:items-center tw:h-8 tw:-scale-x-100">
						<img
							src="/assets/images/bottom-menu-arrow-big.svg"
							alt=""
							class="tw:animate-[arrowAnimate_2s_ease-in-out_infinite]"
						/>
						<img
							src="/assets/images/bottom-menu-arrow-small.svg"
							alt=""
							class="tw:animate-[arrowAnimate2_2s_ease-in-out_infinite]"
						/>
					</div>
				</div>
				{/* 雷达 */}
				<div
					id="bottom-radar"
					class="tw:absolute tw:right-125 tw:bottom-25 tw:z-3 tw:translate-y-full tw:opacity-0"
				>
					<Radar />
				</div>
				{/* 左右装饰线 */}
				<div
					class={cn(
						"tw:absolute tw:left-0 tw:top-1/2",
						"tw:z-3 tw:-mt-135 tw:w-30 tw:h-270",
						"tw:bg-[url(/assets/images/left-kuang.svg)]",
						"tw:bg-no-repeat tw:bg-contain",
						"tw:animate-[screenLineAnimate_3s_infinite]",
					)}
				></div>
				<div
					class={cn(
						"tw:absolute tw:right-0 tw:top-1/2",
						"tw:z-3 tw:-mt-135 tw:w-30 tw:h-270",
						"tw:bg-[url(/assets/images/right-kuang.svg)]",
						"tw:bg-no-repeat tw:bg-contain",
						"tw:animate-[screenLineAnimate_3s_infinite]",
					)}
				></div>
				{/* loading动画 */}
				<div
					id="loading"
					class={cn(
						"tw:absolute tw:left-0 tw:top-0 tw:right-0 tw:bottom-0",
						"tw:bg-black tw:z-99 tw:pointer-events-none",
					)}
				>
					<div
						id="loading-text"
						class={cn(
							"tw:flex tw:justify-center tw:items-center",
							"tw:size-full tw:text-white tw:font-d-din",
							"tw:tracking-[1em]",
						)}
					>
						<span style="--index: 1" class="tw:text-3xl tw:animate-blur-ani">
							L
						</span>
						<span style="--index: 2" class="tw:text-3xl tw:animate-blur-ani">
							O
						</span>
						<span style="--index: 3" class="tw:text-3xl tw:animate-blur-ani">
							A
						</span>
						<span style="--index: 4" class="tw:text-3xl tw:animate-blur-ani">
							D
						</span>
						<span style="--index: 5" class="tw:text-3xl tw:animate-blur-ani">
							I
						</span>
						<span style="--index: 6" class="tw:text-3xl tw:animate-blur-ani">
							N
						</span>
						<span style="--index: 7" class="tw:text-3xl tw:animate-blur-ani">
							G
						</span>
					</div>
					<div
						id="loading-progress"
						class={cn(
							"tw:text-3xl tw:text-white tw:font-d-din",
							"tw:absolute tw:left-1/2 tw:top-1/2 tw:-translate-x-1/2 tw:-translate-y-16 tw:origin-center",
						)}
					>
						<span>{state.progress}</span>
						<span class="tw:pl-2.5 tw:text-xl">%</span>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ChongqingScreen;

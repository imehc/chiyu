/**
 * 广东省大屏页面骨架：一块全屏 canvas 承载 3D 地图，其上叠 DOM 覆盖层放顶部栏、菜单、
 * 统计卡、左右图表列与底部托盘。由路由挂载，autofit 以 1920×1080 设计稿等比缩放到当前视口；
 * 缩放通过 transform 作用在 #guangdong-large-screen 上，元素自身仍按设计稿尺寸布局，
 * 因此内部所有 tw-* 数值都可以直接按 1920×1080 来写，不需要做响应式换算。
 * 场景内容与入场动画全部委托给 world.ts，本文件只负责布局、状态与生命周期。
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
import { guangdongAssets, guangdongStatisticalCards } from "./config";
import GuangdongWorld from "./world";

/** 页面级响应式状态：loading 进度、菜单高亮项与统计卡数据 */
interface GuangdongScreenState {
	/** 资源加载进度，0~100，由 Map3D 的 onProgress 回调写入 */
	progress: number;
	/** 当前选中菜单项的 index，传给 Menu 做受控高亮 */
	activeIndex: string | number;
	/** 顶部统计卡数据，来自 config.ts */
	statisticalCards: Statistical[];
}

/**
 * 广东省数据大屏。
 *
 * 布局采用「canvas 打底 + 绝对定位覆盖层」：canvas 占满视口渲染 3D 场景，
 * 覆盖层 #guangdong-large-screen 承载 Header、顶部 Menu、统计卡、左右各 4 张图表、
 * 底部托盘、雷达与 loading 遮罩。左右图表列通过 perspective + rotate-y 轻微内收，
 * 形成环绕地图的纵深感；覆盖层设 pointer-events-none，避免拦截 canvas 的鼠标拾取。
 *
 * 生命周期：onMount 先 autofit.init 建立缩放，再创建 Map3D 开始加载资源；
 * 资源就绪后 hideLoading → play 启动场景与入场动画；
 * onCleanup 时先销毁场景再解除 autofit 监听，防止缩图层残留。
 */
const GuangdongScreen: Component = () => {
	/** 大屏根节点，作为 autofit 的缩放目标与 Map3D 的 UI 查询根 */
	let containerRef!: HTMLDivElement;
	/** 3D 渲染画布，尺寸由父容器决定 */
	let el!: HTMLCanvasElement;
	/** 场景生命周期句柄，onCleanup 时据此销毁 */
	const [map3d, setMap3d] = createSignal<Map3D>();
	const [state, setState] = createStore<GuangdongScreenState>({
		progress: 0,
		// 默认选中「经济概览」，与 Menu 的 defaultActive 对应
		activeIndex: "1",
		statisticalCards: guangdongStatisticalCards,
	});

	onMount(() => {
		// 以 1920×1080 为设计稿，按视口等比缩放；resize 跟随窗口变化重算
		autofit.init({
			dh: 1080,
			dw: 1920,
			el: "#guangdong-large-screen",
			resize: true,
		});
		// world 传类而非实例，由 Map3D 在资源加载完成后自行 new，避免提前占用 WebGL 资源
		const map = new Map3D({
			el,
			root: containerRef,
			world: GuangdongWorld,
			assets: guangdongAssets,
		});
		map.initAssets(
			async () => {
				// 先等遮罩淡出再播放，否则镜头动画会藏 loading 层后面
				await map.hideLoading();
				map.play();
			},
			(progress) => {
				setState("progress", progress);
			},
		);
		// 句柄存入信号，供 onCleanup 与后续交互统一访问
		setMap3d(map);
	});

	/** 菜单只切换高亮，当前版本不触发场景或数据切换 */
	function handleMenuSelect(index: string | number) {
		setState("activeIndex", index);
	}

	onCleanup(() => {
		// 先停场景与帧循环，再解除缩放监听；顺序反了会让 autofit 在销毁过程中再次改尺寸。
		// Map3D.destroy 内部还会 kill 全局 gsap 时间轴、dispose 场景资源并把 canvas 移出 DOM。
		map3d()?.destroy();
		autofit.off("#guangdong-large-screen");
	});

	// 覆盖层层级：canvas z-2 → 装饰与托盘 z-3 → 左右图表 z-4 → 统计卡 z-9 → loading z-99；
	// 左右两列再叠加 perspective 与相反的 rotate-y，让 8 张图表呈弧面环抱地图。
	return (
		// 根节点定位为全屏容器：canvas 与其上的覆盖层都以它为定位基准
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
				id="guangdong-large-screen"
			>
				{/* 顶部菜单 */}
				<Header
					title="广东省数据可视化平台"
					subText="Guangdong Economic Visualization Platform"
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

export default GuangdongScreen;

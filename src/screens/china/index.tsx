/**
 * 中国大屏页面入口：负责画布与 DOM 叠层的组装、Map3D 生命周期管理、
 * 资源加载进度反馈，以及入场动画触发。
 * 三维场景本身由 ./world.ts 的 ChinaWorld 描述，左右两侧图表来自 ./panels。
 */
import autofit from "autofit.js";
import { createSignal, For, onCleanup, onMount } from "solid-js";
import CurrentTime from "../../componnets/current-time";
import SvgLineAnimation from "../../componnets/svg-line-animation";
import Radar from "../../charts/radar";
import Bottom from "../../layouts/bottom";
import Header from "../../layouts/header";
import StatisticalCard from "../../layouts/statistical-card";
import Map3D from "../../shared/map/map-3d";
import { cn } from "cn";
import { chinaAssets, chinaStatisticalCards } from "./config";
import { ChinaLeftPanels, ChinaRightPanels } from "./panels";
import ChinaWorld from "./world";

/**
 * 中国大屏根组件。
 * 布局是「全屏 canvas 打底 + 绝对定位 DOM 叠层」：canvas 承载 Three.js 场景，
 * 上层的 Header、统计卡片、左右图表、底部菜单、雷达与 LOADING 蒙层都盖在其上。
 * 设计稿基准为 1920×1080，由 autofit 按视口等比缩放。
 */
export default function ChinaScreen() {
	let containerRef!: HTMLDivElement;
	let canvasRef!: HTMLCanvasElement;
	/** Three.js 场景实例，卸载时置空以配合可选链，避免销毁后再被访问 */
	let map: Map3D | undefined;
	/** 资源加载百分比，仅用于 LOADING 蒙层里的数字显示 */
	const [progress, setProgress] = createSignal(0);

	onMount(() => {
		// 以 1920×1080 为基准做整体缩放，并监听窗口尺寸变化重新计算
		autofit.init({
			dh: 1080,
			dw: 1920,
			el: "#china-large-screen",
			resize: true,
		});
		map = new Map3D({
			el: canvasRef,
			root: containerRef,
			world: ChinaWorld,
			assets: chinaAssets,
		});
		// 资源就绪后才淡出蒙层并播放时间线，避免首帧出现空白或材质未就绪
		map.initAssets(
			async () => {
				await map?.hideLoading();
				map?.play();
			},
			(progress) => setProgress(progress),
		);
	});

	onCleanup(() => {
		// 先销毁场景再解绑 autofit，顺序与创建时相反，防止缩放回调访问已销毁的渲染器
		map?.destroy();
		map = undefined;
		autofit.off("#china-large-screen");
	});

	/**
	 * 以下为纯展示结构：三维内容全部在 canvas 里，DOM 只负责文字与装饰图。
	 * 叠层顺序（z 轴由低到高）：canvas(2) → 背景贴图与四角框(3) →
	 * 左右图表面板(4) → 统计卡片(9) → LOADING 蒙层(99)。
	 * #top-menu、#bottom-tray、#bottom-radar 初始为位移+透明状态，
	 * 待地图时间线播完由 shared/map/map-3d.ts 的 handleMapPlayComplete 统一补间入场，
	 * 这些 id 同时被 Map3D 的查询选择器使用，改动时需与公共层保持一致。
	 */
	return (
		<div
			class="tw:relative tw:size-full tw:h-screen tw:bg-black tw:z-1"
			ref={containerRef}
		>
			<canvas class="tw:relative tw:size-full tw:z-2" ref={canvasRef} />
			<div
				id="china-large-screen"
				class={cn(
					"tw:absolute tw:inset-0 tw:z-3 tw:pointer-events-none",
					"tw:after:content-[''] tw:after:block tw:after:absolute tw:after:inset-0",
					"tw:after:z-1 tw:after:opacity-50 tw:after:bg-[url(/assets/images/bg.png)]",
					"tw:after:bg-no-repeat tw:after:bg-cover",
				)}
			>
				<Header
					title="中国数据可视化平台"
					subText="People's Republic of China Data Visualization Platform"
					leftChindren={
						<div class="tw:text-xs tw:tracking-widest tw:text-[#9ed9e8]">
							全国 · 34 个省级区域
						</div>
					}
					rightChindren={<CurrentTime />}
				/>

				<div
					id="top-menu"
					class="tw:absolute tw:top-24 tw:left-1/2 tw:-translate-x-1/2 tw:opacity-0 tw:-translate-y-full"
				>
					<div class="tw:px-5 tw:py-1 tw:border-x tw:border-[#2b91ac] tw:bg-[#071c2c66] tw:text-center">
						<span class="tw:text-[#71e8ef] tw:text-xs tw:tracking-[0.35em]">
							NATIONAL OVERVIEW
						</span>
						<span class="tw:ml-3 tw:text-[#d6c77a] tw:text-xxs">演示数据</span>
					</div>
				</div>

				<div class="tw:absolute tw:top-32 tw:left-140 tw:right-140 tw:flex tw:justify-center tw:z-9">
					<For each={chinaStatisticalCards}>
						{(item) => <StatisticalCard {...item} />}
					</For>
				</div>

				<div class="tw:w-100 tw:absolute tw:left-8 tw:top-32 tw:z-4 tw:perspective-[500px]">
					<div class="tw:flex tw:flex-col tw:rotate-y-6">
						<ChinaLeftPanels />
					</div>
				</div>
				<div class="tw:w-100 tw:absolute tw:right-8 tw:top-32 tw:z-4 tw:perspective-[500px]">
					<div class="tw:flex tw:flex-col tw:-rotate-y-6">
						<ChinaRightPanels />
					</div>
				</div>

				<div
					id="bottom-tray"
					class={cn(
						"tw:absolute tw:left-1/2 tw:bottom-0 tw:z-3 tw:-ml-240 tw:w-480 tw:h-22",
						"tw:flex tw:justify-center tw:bg-[url(/assets/images/bottom-menu-bg.png)]",
						"tw:bg-no-repeat tw:bg-contain tw:translate-y-full tw:opacity-0",
					)}
				>
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
					<div class="tw:flex tw:px-5">
						<For each={["全国总览", "区域协同", "产业洞察", "运行监测"]}>
							{(title, index) => (
								<Bottom title={title} isActive={index() === 0} />
							)}
						</For>
					</div>
				</div>

				<div
					id="bottom-radar"
					class="tw:absolute tw:right-125 tw:bottom-25 tw:z-3 tw:translate-y-full tw:opacity-0"
				>
					<Radar />
				</div>
				<div class="tw:absolute tw:left-0 tw:top-1/2 tw:z-3 tw:-mt-135 tw:w-30 tw:h-270 tw:bg-[url(/assets/images/left-kuang.svg)] tw:bg-no-repeat tw:bg-contain tw:animate-[screenLineAnimate_3s_infinite]" />
				<div class="tw:absolute tw:right-0 tw:top-1/2 tw:z-3 tw:-mt-135 tw:w-30 tw:h-270 tw:bg-[url(/assets/images/right-kuang.svg)] tw:bg-no-repeat tw:bg-contain tw:animate-[screenLineAnimate_3s_infinite]" />

				<div
					id="loading"
					class="tw:absolute tw:inset-0 tw:bg-black tw:z-99 tw:pointer-events-none"
				>
					<div
						id="loading-text"
						class="tw:flex tw:justify-center tw:items-center tw:size-full tw:text-white tw:font-d-din tw:tracking-[1em]"
					>
						<For each={["L", "O", "A", "D", "I", "N", "G"]}>
							{(letter, index) => (
								<span
									style={{ "--index": index() + 1 }}
									class="tw:text-3xl tw:animate-blur-ani"
								>
									{letter}
								</span>
							)}
						</For>
					</div>
					<div
						id="loading-progress"
						class="tw:text-3xl tw:text-white tw:font-d-din tw:absolute tw:left-1/2 tw:top-1/2 tw:-translate-x-1/2 tw:-translate-y-16 tw:origin-center"
					>
						<span>{progress()}</span>
						<span class="tw:pl-2.5 tw:text-xl">%</span>
					</div>
				</div>
			</div>
		</div>
	);
}

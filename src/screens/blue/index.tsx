/**
 * 「蓝色大屏」页面骨架。
 * 负责整体布局（1920×834 设计稿等比缩放）、视图切换、图层与货运模式开关、监测点弹窗、
 * 键盘 Esc 关闭与双击全屏；三维渲染全部委托给 BlueWorld，本文件只做状态编排。
 * 被路由直接挂载，销毁时释放 BlueWorld 与所有计时器、事件监听。
 */
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { BlueControlFrame, BlueTabFrame } from "./button-frame";
import BlueFooter from "./footer";
import type { FreightMode } from "./freight";
import BlueHeader from "./header";
import BlueIcon from "./icons";
import { BlueLeftPanels, BlueRightPanels } from "./panels";
import BlueWorld, { type MonitoringPoint } from "./world";
import "./style.css";
import "./controls.css";

/** 可切换的地图图层标识，与 BlueWorld.setLayer 的参数一一对应 */
type Layer =
	| "flyline"
	| "label"
	| "point"
	| "scatter"
	| "heat"
	| "region"
	| "scan";
/** 地图范围：全球地球或中国行政区平面 */
type View = "china" | "globe";
/**
 * 每个视图的默认图层开关。
 * 中国视图默认全部关闭（只保留行政区本体），全球视图默认全开，切换视图时整组套用。
 */
const defaultLayers = (view: View): Record<Layer, boolean> => ({
	flyline: view === "globe",
	label: view === "globe",
	point: view === "globe",
	scatter: view === "globe",
	heat: view === "globe",
	region: view === "globe",
	scan: view === "globe",
});
/** 图层按钮配置；icon 省略时回退为 id，复用同名的内置图标 */
type LayerItem = { id: Layer; title: string; icon?: string };
/** 中国视图的图层按钮（顺序即按钮渲染顺序） */
const layerItems: LayerItem[] = [
	{ id: "flyline", title: "飞线" },
	{ id: "label", title: "标签" },
	{ id: "point", title: "点位" },
	{ id: "heat", title: "热力图" },
	{ id: "scatter", title: "散点图" },
];
/**
 * 全球视图的图层按钮。
 * 这里的「地理线」复用 region 图层、「海岸线」复用 heat 图层，只是换文案与图标，
 * 避免为视觉差异新增后端图层类型。
 */
const globeLayerItems: LayerItem[] = [
	{ id: "flyline", title: "飞线" },
	{ id: "scatter", title: "散点" },
	{ id: "region", title: "地理线", icon: "graticule" },
	{ id: "heat", title: "海岸线", icon: "coast" },
	{ id: "scan", title: "扫描" },
];
/**
 * 左右两侧舱体的 SVG 描边路径。
 * 坐标系固定为 1920×834 的设计稿像素，outer 为发光外框、inner 为内衬细线；
 * 路径在中段留出竖直缺口，让面板与地图衔接处不被线条穿过。
 */
const shellSides = [
	{
		id: "left",
		outer: "M513 145Q475 227 462 345L470 356V528L460 540Q470 635 514 742",
		inner: "M507 170Q476 255 469 343L478 354V530L468 541Q480 638 509 708",
	},
	{
		id: "right",
		outer:
			"M1407 145Q1445 227 1458 345L1450 356V528L1460 540Q1450 635 1406 742",
		inner:
			"M1413 170Q1444 255 1451 343L1442 354V530L1452 541Q1440 638 1411 708",
	},
];

/**
 * 大屏主组件。
 * 展示内容：三维地图画布、左右数据面板、顶栏时钟与导航、底部状态、图层/视角/范围控制、
 * 行政区面包屑、货运模式开关、监测点浮窗与加载遮罩。
 * 响应式来源：本地 signal（缩放、视图、图层、弹窗等）+ BlueWorld 回调写入的 signal。
 * 生命周期：onMount 绑定 resize/keydown、启动时钟与假进度定时器、创建 BlueWorld；
 * onCleanup 反向清理全部监听、定时器与三维资源。
 */
export default function BlueScreen() {
	/** 由 Solid 通过 ref 注入的 canvas 元素，挂载后才有值 */
	let canvas!: HTMLCanvasElement;
	/** 三维世界实例；onMount 中创建，onCleanup 中销毁 */
	let world: BlueWorld | undefined;
	/** 设计稿（1920 宽）到视口的缩放比例 */
	const [scale, setScale] = createSignal(1);
	/** 舞台高度（设计稿坐标系下的像素），按视口宽高比反推，保证铺满且不变形 */
	const [stageHeight, setStageHeight] = createSignal(834);
	/** 资源加载完成且进度条走完后为 true，用于卸载 loading 遮罩 */
	const [loaded, setLoaded] = createSignal(false);
	/** 加载进度百分比，真实进度未就绪时由定时器渐进逼近 96 */
	const [progress, setProgress] = createSignal(0);
	const [view, setView] = createSignal<View>("globe");
	/** 是否处于视图过渡（云层遮罩期间），同时驱动 aria-busy */
	const [transitioning, setTransitioning] = createSignal(false);
	/** 视图进出场阶段，写入 data-motion 供 CSS 选择器驱动面板动画 */
	const [motionPhase, setMotionPhase] = createSignal<"idle" | "exit" | "enter">(
		"idle",
	);
	/** 切换目标的 class 标记，与 transitioning 分开是因为它也在点击瞬间置位 */
	const [switching, setSwitching] = createSignal(false);
	/** 顶栏导航当前项索引，仅影响顶栏高亮 */
	const [activeNav, setActiveNav] = createSignal(0);
	/** 两个视图各自的图层开关，切视图时来回切换而不丢失用户选择 */
	const savedLayers = {
		china: defaultLayers("china"),
		globe: defaultLayers("globe"),
	};
	const [layers, setLayers] = createSignal(savedLayers[view()]);
	/** 当前选中的行政区名称（空串表示未下钻） */
	const [region, setRegion] = createSignal("");
	/** 下钻路径上的行政区名称，用于面包屑与 data-depth */
	const [regionPath, setRegionPath] = createSignal<string[]>([]);
	const [freightModes, setFreightModes] = createSignal({
		rail: true,
		sea: true,
		air: true,
	});
	/** 当前展示的监测点；x / y 由三维层投影换算成舞台像素，弹窗按此绝对定位 */
	const [popup, setPopup] = createSignal<MonitoringPoint | null>(null);
	/** 弹窗播放退场动画期间为 true，动画结束后才真正卸载 */
	const [popupClosing, setPopupClosing] = createSignal(false);
	/** 弹窗 key，递增即强制重建 DOM，让入场动画从头播放 */
	const [popupVersion, setPopupVersion] = createSignal(0);
	/** 退场期间用户新点的监测点，等旧弹窗关闭后再展示，避免闪烁 */
	let pendingPopup: MonitoringPoint | null = null;
	/** 弹窗退场兜底定时器；animationend 未触发时靠它保证状态复位 */
	let popupTimer: ReturnType<typeof setTimeout> | undefined;
	const [time, setTime] = createSignal(new Date());
	let readyTimer: ReturnType<typeof setTimeout>;
	/** 首次入场动画的结束定时器，转场开始时要取消 */
	let initialMotionTimer: ReturnType<typeof setTimeout> | undefined;
	let ticker: ReturnType<typeof setInterval>;
	let loadingTicker: ReturnType<typeof setInterval>;
	/**
	 * 按视口重算缩放与舞台高度。
	 * 宽度对齐 1920 设计稿，高度用宽高比换算，使画面始终铺满窗口且不拉伸。
	 */
	const resize = () => {
		setScale(window.innerWidth / 1920);
		setStageHeight((1920 * window.innerHeight) / window.innerWidth);
	};
	/** 顶栏时钟文案；中文星期由固定字串按下标取字，避免依赖 Intl 的语言环境 */
	const clock = () => {
		const d = time();
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}  星期${"日一二三四五六"[d.getDay()]}`;
	};
	/** 打开弹窗前先递增版本号，确保同一点位重复打开时也能重播入场动画 */
	const showPopup = (point: MonitoringPoint) => {
		setPopupVersion((version) => version + 1);
		setPopup(point);
	};
	/**
	 * 退场结束的统一收尾：清掉 pending、卸下 DOM，若有排队点位立即接续打开。
	 * animationend 与 260ms 兜底定时器都会走到这里，重复调用是安全的。
	 */
	const finishPopupExit = () => {
		clearTimeout(popupTimer);
		const next = pendingPopup;
		pendingPopup = null;
		setPopup(null);
		setPopupClosing(false);
		if (next) showPopup(next);
	};
	/** 给弹窗挂上 closing 类触发 CSS 退场动画；已关闭或正在关闭时直接忽略 */
	const animatePopupOut = () => {
		if (!popup() || popupClosing()) return;
		setPopupClosing(true);
		popupTimer = setTimeout(finishPopupExit, 260);
	};
	/** 用户主动关闭：丢弃排队点位、取消地图高亮，再播放退场 */
	const closePopup = () => {
		pendingPopup = null;
		world?.closeMonitoringPoint();
		animatePopupOut();
	};
	/** 全局 Esc 处理；只在页面级注册一次，弹窗未打开时调用无副作用 */
	const onPopupKey = (event: KeyboardEvent) => {
		if (event.key === "Escape") closePopup();
	};
	onMount(() => {
		resize();
		window.addEventListener("resize", resize);
		// 键盘监听挂在 window 上：全屏或焦点在按钮上时也要能 Esc 关闭
		window.addEventListener("keydown", onPopupKey);
		ticker = setInterval(() => setTime(new Date()), 1000);
		// 真实加载没有细粒度进度，用逐步收敛的伪进度（上限 96）避免卡在 0 太久
		loadingTicker = setInterval(
			() => setProgress((n) => Math.min(96, n + Math.ceil((98 - n) / 5))),
			90,
		);
		world = new BlueWorld(canvas, {
			onDrillChange: (path) => {
				setRegionPath(path);
				setRegion(path.at(-1) ?? "");
				closePopup();
			},
			onViewChange: (next) => {
				setView(next);
				setRegion(next === "china" ? (world?.getState().region ?? "") : "");
				closePopup();
				// 恢复目标视图上次的图层选择，并一次性同步给三维层
				setLayers(savedLayers[next]);
				for (const [id, enabled] of Object.entries(savedLayers[next])) {
					world?.setLayer(id as Layer, enabled);
				}
			},
			onTransitionChange: (active) => {
				// 转场开始时取消首次入场收尾，避免两个动画相位互相覆盖
				if (active) clearTimeout(initialMotionTimer);
				setTransitioning(active);
				setSwitching(active);
			},
			onViewMotionChange: setMotionPhase,
			onReady: () => {
				clearInterval(loadingTicker);
				setProgress(100);
				// 留 650ms 让进度条走满再淡出遮罩，避免 100% 瞬间消失
				readyTimer = setTimeout(() => {
					setLoaded(true);
					if (transitioning()) return;
					setMotionPhase("enter");
					initialMotionTimer = setTimeout(() => {
						if (!transitioning() && motionPhase() === "enter")
							setMotionPhase("idle");
					}, 2000);
				}, 650);
			},
			onRegion: (name) => {
				closePopup();
				world?.drilldown(name);
			},
			onMonitoringPoint: (point) => {
				if (!point) {
					closePopup();
					return;
				}
				// 已有弹窗在关或换了点位：先退场再入场，保证同一时刻只有一个浮窗
				if (popupClosing() || (popup() && popup()?.name !== point.name)) {
					pendingPopup = point;
					animatePopupOut();
				} else if (popup()) {
					setPopup(point);
				} else {
					showPopup(point);
				}
			},
		});
		// 仅开发环境把实例挂到 canvas 上，方便控制台手动调用 API 调试
		if (import.meta.env.DEV) Reflect.set(canvas, "__blueWorld", world);
	});
	onCleanup(() => {
		window.removeEventListener("resize", resize);
		window.removeEventListener("keydown", onPopupKey);
		clearInterval(ticker);
		clearInterval(loadingTicker);
		clearTimeout(readyTimer);
		clearTimeout(initialMotionTimer);
		clearTimeout(popupTimer);
		world?.destroy();
		Reflect.deleteProperty(canvas, "__blueWorld");
	});
	/**
	 * 切换视图：先关弹窗，再交给三维层。
	 * switching 在目标与当前不同、或正处转场中时为 true，从而忽略重复点击造成的空转。
	 */
	const changeView = (next: View) => {
		closePopup();
		setSwitching(next !== view() || transitioning());
		world?.setView(next);
	};
	/** 切换单个图层；关闭「点位」时顺带关闭浮窗，避免浮窗锚在已隐藏的点上 */
	const toggleLayer = (id: Layer) => {
		const enabled = !layers()[id];
		if (id === "point" && !enabled) closePopup();
		const updated = { ...layers(), [id]: enabled };
		savedLayers[view()] = updated;
		setLayers(updated);
		world?.setLayer(id, enabled);
	};
	const reset = () => {
		closePopup();
		world?.reset();
	};
	const goBack = () => {
		closePopup();
		world?.goBack();
	};
	const toggleFreight = (mode: FreightMode) => {
		const enabled = !freightModes()[mode];
		setFreightModes({ ...freightModes(), [mode]: enabled });
		world?.setFreightMode(mode, enabled);
	};
	/** 进入/退出浏览器全屏；双指双击画布也会走到这里（见 main 的 onDblClick） */
	const fullscreen = () => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void document.documentElement.requestFullscreen();
	};
	// data-* 属性是给 CSS 用的状态钩子：视图、动画相位、当前行政区与下钻深度都会影响样式
	return (
		<main
			class="blue-shell"
			classList={{
				"blue-loaded": loaded(),
				"blue-view-transition": switching(),
			}}
			data-view={view()}
			data-motion={motionPhase()}
			data-region={region()}
			data-depth={regionPath().length}
			aria-busy={transitioning()}
			aria-label="可视化大屏"
			onDblClick={(event) => {
				// 只在画布本身双击时全屏，避免双击面板或按钮误触发
				if (event.target === canvas) fullscreen();
			}}
		>
			<div
				class="blue-stage"
				style={{
					height: `${stageHeight()}px`,
					// 舞台以中心为原点做等比缩放，translate 抵消自身尺寸后正好居中
					transform: `translate(-50%, -50%) scale(${scale()})`,
					// 小屏补偿控件命中区：scale 低于 2/3 时按 2/(3*scale) 反比放大，屏幕尺寸最低停在设计值的 2/3
					"--blue-control-scale": String(Math.max(1, 2 / (3 * scale()))),
				}}
			>
				<canvas
					ref={canvas}
					class="blue-map-canvas"
					aria-label={
						view() === "globe"
							? "可交互三维地球，拖动旋转，滚轮缩放"
							: "可交互三维中国地图，点击省份下钻，拖动旋转，滚轮缩放"
					}
				/>
				<div class="blue-vignette" />
				<svg
					class="blue-frame"
					viewBox="0 0 1920 834"
					preserveAspectRatio="none"
					fill="none"
					aria-hidden="true"
				>
					<defs>
						<linearGradient
							id="blue-frame-gradient"
							x1="0"
							y1="0"
							x2="0"
							y2="1"
						>
							<stop stop-color="#168ed1" stop-opacity=".1" />
							<stop offset=".45" stop-color="#39cde8" />
							<stop offset="1" stop-color="#27e5f5" stop-opacity=".2" />
						</linearGradient>
						<filter id="blue-frame-glow">
							<feGaussianBlur stdDeviation="4" />
						</filter>
					</defs>
					<For each={shellSides}>
						{(side) => (
							<g class={`blue-shell-frame blue-shell-frame-${side.id}`}>
								<g class="blue-shell-breathing">
									<path
										class="blue-shell-glow"
										d={side.outer}
										stroke="#1d8bd1"
										stroke-width="7"
										opacity=".35"
										filter="url(#blue-frame-glow)"
									/>
									<path
										class="blue-shell-edge"
										d={side.outer}
										stroke="url(#blue-frame-gradient)"
										stroke-width="2"
									/>
									<path d={side.inner} stroke="#12537e" />
								</g>
							</g>
						)}
					</For>
					<path
						d="M11 77V797L4 815V831H265M1909 77V797L1916 815V831H1655"
						stroke="#135676"
					/>
				</svg>
				<BlueFooter />
				<BlueHeader
					clock={clock()}
					activeNav={activeNav()}
					onNavigate={setActiveNav}
				/>
				<aside class="blue-panels blue-panels-left" aria-label="左侧数据图表">
					<BlueLeftPanels globe={view() === "globe"} />
				</aside>
				<aside class="blue-panels blue-panels-right" aria-label="右侧数据图表">
					<BlueRightPanels globe={view() === "globe"} />
				</aside>
				<fieldset class="blue-layers" aria-label="地图图层">
					<For each={view() === "globe" ? globeLayerItems : layerItems}>
						{(item) => (
							<button
								type="button"
								class="blue-layer-button"
								data-layer={item.id}
								classList={{ enabled: layers()[item.id] }}
								aria-pressed={layers()[item.id]}
								onClick={() => toggleLayer(item.id)}
							>
								<BlueTabFrame />
								<BlueIcon name={item.icon ?? item.id} />
								<span class="blue-button-label">{item.title}</span>
							</button>
						)}
					</For>
				</fieldset>
				<fieldset class="blue-map-tools" aria-label="地图视角控制">
					<button type="button" onClick={() => world?.zoom(1.18)}>
						<BlueControlFrame marker />
						<span class="blue-button-label">放大</span>
					</button>
					<button type="button" onClick={() => world?.zoom(1 / 1.18)}>
						<BlueControlFrame marker />
						<span class="blue-button-label">缩小</span>
					</button>
					<button type="button" onClick={() => world?.setTopView()}>
						<BlueControlFrame marker />
						<span class="blue-button-label">俯视</span>
					</button>
					<button type="button" onClick={reset}>
						<BlueControlFrame marker />
						<span class="blue-button-label">还原</span>
					</button>
				</fieldset>
				<Show when={region()}>
					<button type="button" class="blue-back" onClick={goBack}>
						<BlueControlFrame />
						<BlueIcon name="back" />
						<span class="blue-button-label">回到上级</span>
					</button>
					<nav class="blue-region-path" aria-label="当前地图层级">
						中国 / {regionPath().join(" / ")}
					</nav>
				</Show>
				<Show when={view() === "globe"}>
					<fieldset class="blue-freight-modes" aria-label="货运航线">
						<For
							each={[
								{ mode: "rail" as const, title: "铁路" },
								{ mode: "sea" as const, title: "海运" },
								{ mode: "air" as const, title: "空运" },
							]}
						>
							{(item) => (
								<button
									type="button"
									data-mode={item.mode}
									aria-pressed={freightModes()[item.mode]}
									onClick={() => toggleFreight(item.mode)}
								>
									<BlueTabFrame />
									<span class="blue-freight-indicator" />
									<span class="blue-button-label">{item.title}</span>
								</button>
							)}
						</For>
					</fieldset>
				</Show>
				<Show when={popup() && popupVersion()} keyed>
					<div
						class="blue-monitor-anchor"
						style={{ left: `${popup()?.x}px`, top: `${popup()?.y}px` }}
					>
						<section
							class="blue-monitor"
							classList={{ "blue-monitor-closing": popupClosing() }}
							aria-label={popup()?.name}
							aria-hidden={popupClosing()}
							onAnimationEnd={() => {
								// 退场动画播完才卸载 DOM；若动画被禁用则交给 260ms 兜底定时器
								if (popupClosing()) finishPopupExit();
							}}
						>
							<header class="blue-monitor-header">
								<strong>{popup()?.name}</strong>
								<button
									class="blue-monitor-close"
									type="button"
									aria-label="关闭监测点"
									onClick={closePopup}
								>
									<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path d="m6 6 12 12M18 6 6 18" />
									</svg>
								</button>
							</header>
							<dl class="blue-monitor-data">
								<div>
									<dt>防洪工程：</dt>
									<dd>12</dd>
								</div>
								<div>
									<dt>道路施工：</dt>
									<dd>18</dd>
								</div>
								<div>
									<dt>完成进度：</dt>
									<dd>80%</dd>
								</div>
							</dl>
							<span class="blue-monitor-arrow" aria-hidden="true" />
						</section>
					</div>
				</Show>
				<nav class="blue-view-tabs" aria-label="地图范围">
					<button
						type="button"
						classList={{ active: view() === "globe" }}
						aria-pressed={view() === "globe"}
						onClick={() => changeView("globe")}
					>
						<BlueTabFrame />
						<span class="blue-button-label">全球</span>
					</button>
					<button
						type="button"
						classList={{ active: view() === "china" }}
						aria-pressed={view() === "china"}
						onClick={() => changeView("china")}
					>
						<BlueTabFrame />
						<span class="blue-button-label">中国</span>
					</button>
				</nav>
				<Show when={!loaded()}>
					<div class="blue-loading">
						<div class="blue-loading-progress">
							{progress()}
							<small> %</small>
						</div>
						<div class="blue-loading-word">LOADING</div>
					</div>
				</Show>
			</div>
		</main>
	);
}

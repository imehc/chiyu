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

type Layer =
	| "flyline"
	| "label"
	| "point"
	| "scatter"
	| "heat"
	| "region"
	| "scan";
type View = "china" | "globe";
const defaultLayers = (view: View): Record<Layer, boolean> => ({
	flyline: view === "globe",
	label: view === "globe",
	point: view === "globe",
	scatter: view === "globe",
	heat: view === "globe",
	region: view === "globe",
	scan: view === "globe",
});
type LayerItem = { id: Layer; title: string; icon?: string };
const layerItems: LayerItem[] = [
	{ id: "flyline", title: "飞线" },
	{ id: "label", title: "标签" },
	{ id: "point", title: "点位" },
	{ id: "heat", title: "热力图" },
	{ id: "scatter", title: "散点图" },
];
const globeLayerItems: LayerItem[] = [
	{ id: "flyline", title: "飞线" },
	{ id: "scatter", title: "散点" },
	{ id: "region", title: "地理线", icon: "graticule" },
	{ id: "heat", title: "海岸线", icon: "coast" },
	{ id: "scan", title: "扫描" },
];
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

export default function BlueScreen() {
	let canvas!: HTMLCanvasElement;
	let world: BlueWorld | undefined;
	const [scale, setScale] = createSignal(1);
	const [stageHeight, setStageHeight] = createSignal(834);
	const [loaded, setLoaded] = createSignal(false);
	const [progress, setProgress] = createSignal(0);
	const [view, setView] = createSignal<View>("china");
	const [transitioning, setTransitioning] = createSignal(false);
	const [motionPhase, setMotionPhase] = createSignal<"idle" | "exit" | "enter">(
		"idle",
	);
	const [switching, setSwitching] = createSignal(false);
	const [activeNav, setActiveNav] = createSignal(0);
	const savedLayers = {
		china: defaultLayers("china"),
		globe: defaultLayers("globe"),
	};
	const [layers, setLayers] = createSignal(savedLayers[view()]);
	const [region, setRegion] = createSignal("");
	const [regionPath, setRegionPath] = createSignal<string[]>([]);
	const [freightModes, setFreightModes] = createSignal({
		rail: true,
		sea: true,
		air: true,
	});
	const [popup, setPopup] = createSignal<MonitoringPoint | null>(null);
	const [popupClosing, setPopupClosing] = createSignal(false);
	const [popupVersion, setPopupVersion] = createSignal(0);
	let pendingPopup: MonitoringPoint | null = null;
	let popupTimer: ReturnType<typeof setTimeout> | undefined;
	const [time, setTime] = createSignal(new Date());
	let readyTimer: ReturnType<typeof setTimeout>;
	let initialMotionTimer: ReturnType<typeof setTimeout> | undefined;
	let ticker: ReturnType<typeof setInterval>;
	let loadingTicker: ReturnType<typeof setInterval>;
	const resize = () => {
		setScale(window.innerWidth / 1920);
		setStageHeight((1920 * window.innerHeight) / window.innerWidth);
	};
	const clock = () => {
		const d = time();
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}  星期${"日一二三四五六"[d.getDay()]}`;
	};
	const showPopup = (point: MonitoringPoint) => {
		setPopupVersion((version) => version + 1);
		setPopup(point);
	};
	const finishPopupExit = () => {
		clearTimeout(popupTimer);
		const next = pendingPopup;
		pendingPopup = null;
		setPopup(null);
		setPopupClosing(false);
		if (next) showPopup(next);
	};
	const animatePopupOut = () => {
		if (!popup() || popupClosing()) return;
		setPopupClosing(true);
		popupTimer = setTimeout(finishPopupExit, 260);
	};
	const closePopup = () => {
		pendingPopup = null;
		world?.closeMonitoringPoint();
		animatePopupOut();
	};
	const onPopupKey = (event: KeyboardEvent) => {
		if (event.key === "Escape") closePopup();
	};
	onMount(() => {
		resize();
		window.addEventListener("resize", resize);
		window.addEventListener("keydown", onPopupKey);
		ticker = setInterval(() => setTime(new Date()), 1000);
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
				setLayers(savedLayers[next]);
				for (const [id, enabled] of Object.entries(savedLayers[next])) {
					world?.setLayer(id as Layer, enabled);
				}
			},
			onTransitionChange: (active) => {
				if (active) clearTimeout(initialMotionTimer);
				setTransitioning(active);
				setSwitching(active);
			},
			onViewMotionChange: setMotionPhase,
			onReady: () => {
				clearInterval(loadingTicker);
				setProgress(100);
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
	const changeView = (next: View) => {
		closePopup();
		setSwitching(next !== view() || transitioning());
		world?.setView(next);
	};
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
	const fullscreen = () => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void document.documentElement.requestFullscreen();
	};
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
				if (event.target === canvas) fullscreen();
			}}
		>
			<div
				class="blue-stage"
				style={{
					height: `${stageHeight()}px`,
					transform: `translate(-50%, -50%) scale(${scale()})`,
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

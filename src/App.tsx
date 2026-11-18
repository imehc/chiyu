import { createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Pane } from "tweakpane";
import {
	type ScreenId,
	screenOptions,
	screenRegistry,
} from "./screens/registry";

const POS_KEY = "screen-switcher-pos";
const PANEL_MIN_WIDTH = 150;

const screenIds = Object.keys(screenRegistry) as ScreenId[];
const PANEL_MIN_VISIBLE = 80;

function clampPosition(x: number, y: number) {
	const maxX = window.innerWidth - PANEL_MIN_VISIBLE;
	const maxY = window.innerHeight - PANEL_MIN_VISIBLE;
	return {
		x: Math.min(Math.max(0, x), Math.max(0, maxX)),
		y: Math.min(Math.max(0, y), Math.max(0, maxY)),
	};
}

function loadPosition() {
	try {
		const raw = localStorage.getItem(POS_KEY);
		if (raw) {
			const { x, y } = JSON.parse(raw);
			if (typeof x === "number" && typeof y === "number") {
				return clampPosition(x, y);
			}
		}
	} catch {
		// ignore malformed cache
	}
	return null;
}

export default function App() {
	let handleRef!: HTMLDivElement;
	let panelRef!: HTMLDivElement;
	let pane: Pane | undefined;
	let fsButton: ReturnType<Pane["addButton"]> | undefined;

	const [currentScreen, setCurrentScreen] = createSignal<ScreenId>("guangdong");
	const [position, setPosition] = createSignal(
		loadPosition() ??
			clampPosition(
				window.innerWidth - PANEL_MIN_WIDTH - 16,
				window.innerHeight - 220,
			),
	);
	const [dragging, setDragging] = createSignal(false);
	const [collapsed, setCollapsed] = createSignal(false);
	const [panelWidth, setPanelWidth] = createSignal(PANEL_MIN_WIDTH);

	let dragState: {
		px: number;
		py: number;
		x: number;
		y: number;
		moved: boolean;
		pointerId: number;
	} | null = null;

	const savePosition = (pos: { x: number; y: number }) => {
		try {
			localStorage.setItem(POS_KEY, JSON.stringify(pos));
		} catch {
			// ignore quota errors
		}
	};

	const toggleFullscreen = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			document.documentElement.requestFullscreen().catch(() => {});
		}
	};

	// 仅顶部把手条可拖拽（折叠按钮除外）
	const onPointerDown = (e: PointerEvent) => {
		if ((e.target as HTMLElement).closest(".screen-switcher-collapse")) {
			return;
		}
		e.preventDefault();
		handleRef.setPointerCapture(e.pointerId);
		const pos = position();
		dragState = {
			px: e.clientX,
			py: e.clientY,
			x: pos.x,
			y: pos.y,
			moved: false,
			pointerId: e.pointerId,
		};
		setDragging(true);
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!dragState) return;
		const dx = e.clientX - dragState.px;
		const dy = e.clientY - dragState.py;
		if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
		dragState.moved = true;
		setPosition(clampPosition(dragState.x + dx, dragState.y + dy));
	};

	const onPointerUp = () => {
		if (!dragState) return;
		try {
			handleRef.releasePointerCapture(dragState.pointerId);
		} catch {
			// 指针未捕获时忽略
		}
		if (dragState.moved) savePosition(position());
		dragState = null;
		setDragging(false);
	};

	const onFullscreenChange = () => {
		const fs = Boolean(document.fullscreenElement);
		if (fsButton) fsButton.title = fs ? "退出全屏" : "进入全屏";
	};

	const onWindowResize = () =>
		setPosition((pos) => clampPosition(pos.x, pos.y));

	onMount(() => {
		pane = new Pane({ container: panelRef, expanded: true });

		// 实测最长文案，得出面板统一宽度（展开/折叠一致，且不小于最小宽度）
		const measure = (text: string) => {
			const span = document.createElement("span");
			span.style.cssText =
				"position:fixed;visibility:hidden;white-space:nowrap;font-size:12px;";
			span.textContent = text;
			document.body.appendChild(span);
			const w = span.offsetWidth;
			span.remove();
			return w;
		};
		const contentWidth = Math.max(
			...screenIds.map((id) => measure(screenRegistry[id].label)),
			measure("进入全屏"),
			measure("退出全屏"),
		);
		setPanelWidth(
			Math.min(
				Math.max(PANEL_MIN_WIDTH, contentWidth + 28),
				window.innerWidth - 8,
			),
		);

		const params = { screen: currentScreen() };
		pane
			.addBinding(params, "screen", {
				// label 传 undefined 时 Tweakpane 进入 nol 模式：隐藏 label、值占满整行
				label: undefined,
				options: screenOptions,
			})
			.on("change", (event) => {
				const id = event.value as ScreenId;
				// 选项值异常时保持当前大屏，避免渲染 undefined 组件
				if (!id || !screenRegistry[id]) return;
				setCurrentScreen(id);
			});

		fsButton = pane.addButton({ title: "进入全屏" });
		fsButton.on("click", toggleFullscreen);
		document.addEventListener("fullscreenchange", onFullscreenChange);
		window.addEventListener("resize", onWindowResize);
	});

	onCleanup(() => {
		document.removeEventListener("fullscreenchange", onFullscreenChange);
		window.removeEventListener("resize", onWindowResize);
		pane?.dispose();
	});

	return (
		<>
			<Dynamic component={screenRegistry[currentScreen()].component} />
			<div
				class="screen-switcher"
				classList={{ dragging: dragging() }}
				style={{
					left: `${position().x}px`,
					top: `${position().y}px`,
					width: `${panelWidth()}px`,
				}}
			>
				<div
					ref={handleRef}
					class="screen-switcher-handle"
					title="拖动移动面板"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				>
					<svg
						class="grip"
						viewBox="0 0 30 10"
						fill="currentColor"
						aria-hidden="true"
					>
						{[6, 12, 18, 24].flatMap((x) => [
							<circle cx={x} cy={3} r="1.4" />,
							<circle cx={x} cy={7} r="1.4" />,
						])}
					</svg>
					<button
						type="button"
						class="screen-switcher-collapse"
						title={collapsed() ? "展开面板" : "折叠面板"}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => setCollapsed((v) => !v)}
					>
						<svg
							viewBox="0 0 12 12"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
							style={{ transform: collapsed() ? "rotate(-90deg)" : "" }}
						>
							<path d="M3 4.5 L6 7.5 L9 4.5" />
						</svg>
					</button>
				</div>
				<div
					ref={panelRef}
					style={{ display: collapsed() ? "none" : "block" }}
				/>
			</div>
		</>
	);
}

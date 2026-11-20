/**
 * 应用外壳：负责「选哪块大屏」以及悬浮的 Tweakpane 切换面板。
 * 支持 URL ?screen= 指定初始大屏、S 键显隐面板、拖拽把手移动并记忆位置、
 * 折叠展开与全屏切换；具体大屏内容由 screens/registry 动态提供。
 */
import {
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	Suspense,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Pane } from "tweakpane";
import {
	type ScreenId,
	screenOptions,
	screenRegistry,
} from "./screens/registry";

/** localStorage 中记录面板坐标的键名 */
const POS_KEY = "screen-switcher-pos";
/** 面板的最小宽度（像素），内容更窄时也按此宽度渲染 */
const PANEL_MIN_WIDTH = 150;

const screenIds = Object.keys(screenRegistry) as ScreenId[];
/** 面板移出视口时至少保留的可点击尺寸，保证用户还能把面板拖回来 */
const PANEL_MIN_VISIBLE = 80;

/**
 * 把面板坐标限制在视口内。
 * 允许右/下越界一部分，靠 PANEL_MIN_VISIBLE 留出可抓取的区域，
 * 避免窗口缩小或脏数据导致面板彻底消失。
 * @param x 期望的视口横坐标（像素）
 * @param y 期望的视口纵坐标（像素）
 * @returns 修正后的坐标
 */
function clampPosition(x: number, y: number) {
	const maxX = window.innerWidth - PANEL_MIN_VISIBLE;
	const maxY = window.innerHeight - PANEL_MIN_VISIBLE;
	return {
		x: Math.min(Math.max(0, x), Math.max(0, maxX)),
		y: Math.min(Math.max(0, y), Math.max(0, maxY)),
	};
}

/**
 * 读取上次保存的面板坐标。
 * 缓存可能被用户手改或来自旧版本，因此解析失败、字段类型不对时一律当作「没有记录」，
 * 由调用方退回默认位置，不能让启动流程抛错。
 * @returns 合法坐标；无有效缓存时返回 null
 */
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
		// 缓存内容损坏或不是合法 JSON 时按「未保存过位置」处理
	}
	return null;
}

/**
 * 根组件：渲染当前大屏并挂载悬浮切换面板。
 * 面板本身是原生 DOM（而非 Solid 渲染），生命周期由 onMount / onCleanup 手动管理；
 * 大屏组件通过 Dynamic 按 registry 中的键切换。
 */
export default function App() {
	/** 顶部拖拽把手，指针捕获与释放都作用在它身上 */
	let handleRef!: HTMLDivElement;
	/** Tweakpane 的挂载容器，宽度与折叠状态由外层控制 */
	let panelRef!: HTMLDivElement;
	let pane: Pane | undefined;
	/** 全屏按钮句柄，用来在 fullscreenchange 时同步按钮文案 */
	let fsButton: ReturnType<Pane["addButton"]> | undefined;
	/** 组件卸载标记：异步 import 返回时若已卸载则不再创建面板 */
	let disposed = false;
	/** 防止 setupPane 被并发调用（展开面板的 effect 可能连续触发） */
	let paneLoading = false;

	// 初始大屏优先取 URL 上的 screen 参数，非法值静默回落到 blue
	const requestedScreen = new URLSearchParams(window.location.search).get(
		"screen",
	);
	const initialScreen: ScreenId =
		requestedScreen && Object.hasOwn(screenRegistry, requestedScreen)
			? (requestedScreen as ScreenId)
			: "blue";
	const [currentScreen, setCurrentScreen] =
		createSignal<ScreenId>(initialScreen);
	// 默认大屏（blue）不需要切换面板，避免遮挡首屏；其它屏默认展开
	const [controlsVisible, setControlsVisible] = createSignal(
		initialScreen !== "blue",
	);
	// 优先恢复上次位置；首次访问时贴着右下角摆放，并留出边距
	const [position, setPosition] = createSignal(
		loadPosition() ??
			clampPosition(
				window.innerWidth - PANEL_MIN_WIDTH - 16,
				window.innerHeight - 220,
			),
	);
	const [dragging, setDragging] = createSignal(false);
	const [collapsed, setCollapsed] = createSignal(false);
	// 面板宽度由内容实测得出，初始值仅用于首帧渲染
	const [panelWidth, setPanelWidth] = createSignal(PANEL_MIN_WIDTH);

	// 拖拽会话状态：按下时的指针位置、面板原点、是否真正移动过、被捕获的指针 id
	let dragState: {
		px: number;
		py: number;
		x: number;
		y: number;
		moved: boolean;
		pointerId: number;
	} | null = null;

	/**
	 * 持久化面板坐标。
	 * 隐私模式或存储配额满时 setItem 会抛异常，这里吞掉以保证拖拽不中断。
	 */
	const savePosition = (pos: { x: number; y: number }) => {
		try {
			localStorage.setItem(POS_KEY, JSON.stringify(pos));
		} catch {
			// 隐私模式或配额不足时写入失败，忽略即可，不影响当前拖拽
		}
	};

	/**
	 * 切换浏览器全屏。
	 * requestFullscreen / exitFullscreen 返回 Promise，用户手势被拒绝或浏览器不支持时会 reject，
	 * 这里只做空捕获，失败时不改变界面状态。
	 */
	const toggleFullscreen = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			document.documentElement.requestFullscreen().catch(() => {});
		}
	};

	// 仅顶部把手条可拖拽（折叠按钮除外）
	/**
	 * 拖拽开始。
	 * 用 setPointerCapture 把后续 pointermove/pointerup 都锁定到把手元素上，
	 * 这样指针移出面板（甚至移出窗口）时仍能收到事件，不必在 window 上挂全局监听。
	 * 折叠按钮自身会 stopPropagation，这里再按 closest 兜底。
	 */
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

	/**
	 * 拖拽过程。
	 * 位移小于 4 像素时视为手抖，不进入 moved 状态：既避免点击时面板轻微跳动，
	 * 也保证单纯点一下把手不会写入 localStorage。
	 * 位置始终按「按下时的原点 + 总位移」计算，防止逐帧累加带来的误差。
	 */
	const onPointerMove = (e: PointerEvent) => {
		if (!dragState) return;
		const dx = e.clientX - dragState.px;
		const dy = e.clientY - dragState.py;
		if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
		dragState.moved = true;
		setPosition(clampPosition(dragState.x + dx, dragState.y + dy));
	};

	/**
	 * 拖拽结束（pointerup / pointercancel 共用）。
	 * 只有真正移动过才落盘，避免无意义的写入；释放捕获失败说明指针已经丢失，忽略即可。
	 */
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

	/** 全屏状态变化时同步按钮文案（进入/退出由 ESC 或浏览器 UI 也能触发） */
	const onFullscreenChange = () => {
		const fs = Boolean(document.fullscreenElement);
		if (fsButton) fsButton.title = fs ? "退出全屏" : "进入全屏";
	};

	// 视口缩小后原坐标可能越界，重新夹紧一次即可，无需写回 localStorage
	const onWindowResize = () =>
		setPosition((pos) => clampPosition(pos.x, pos.y));
	/**
	 * 全局快捷键：S 键切换面板显隐。
	 * 带 Ctrl / Cmd / Alt 的组合键不拦截（留给浏览器），
	 * 焦点在输入类元素时同样跳过，否则会吞掉用户正在输入的字符。
	 */
	const onControlKey = (event: KeyboardEvent) => {
		if (
			event.key.toLowerCase() === "s" &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey &&
			!(
				event.target instanceof HTMLElement &&
				event.target.closest("input, textarea, select, [contenteditable]")
			)
		) {
			setControlsVisible((visible) => !visible);
		}
	};

	/**
	 * 懒加载并初始化 Tweakpane 面板。
	 * 面板不是首屏必需资源，动态 import 可以让 tweakpane 单独成块，减小首屏体积；
	 * 已创建或正在创建时直接返回，保证重复触发（展开/收起）不会堆出多个面板。
	 */
	const setupPane = async () => {
		if (pane || paneLoading) return;
		paneLoading = true;
		try {
			const { Pane } = await import("tweakpane");
			// await 期间组件可能已卸载，此时再 new Pane 会挂到已移除的容器上
			if (disposed) return;
			pane = new Pane({ container: panelRef, expanded: true });

			// 实测最长文案，得出面板统一宽度（展开/折叠一致，且不小于最小宽度）
			/**
			 * 用一个隐藏的 span 测文本渲染宽度。
			 * span 必须挂在 body 上才能取到父级继承的字体，测完立即移除以免污染布局；
			 * 字号与面板一致（12px），否则测出的宽度没有参考价值。
			 */
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
			// 取所有大屏名称与全屏按钮文案中最宽的一个，+28 为左右内边距与箭头留白
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
					// 同步到地址栏，便于刷新/分享时回到同一块大屏；replaceState 不新增历史记录
					const url = new URL(window.location.href);
					url.searchParams.set("screen", id);
					window.history.replaceState(null, "", url);
				});

			fsButton = pane.addButton({ title: "进入全屏" });
			fsButton.on("click", toggleFullscreen);
			// 面板可能在退出全屏后才创建，先按当前状态校准一次文案
			onFullscreenChange();
		} catch (error) {
			// 网络异常导致 chunk 加载失败时只记录日志，大屏本身仍可正常使用
			console.error("Unable to load screen controls.", error);
		} finally {
			paneLoading = false;
		}
	};

	onMount(() => {
		// 放到 effect 里是为了跟 controlsVisible 建立依赖：用户按 S 重新显示面板时才首次创建
		createEffect(() => {
			if (controlsVisible()) void setupPane();
		});
		document.addEventListener("fullscreenchange", onFullscreenChange);
		window.addEventListener("resize", onWindowResize);
		window.addEventListener("keydown", onControlKey);
	});

	/**
	 * 卸载清理：先置 disposed 标记，再摘监听，最后销毁面板。
	 * 标记必须在最前，才能拦住仍在 await 中的 setupPane；
	 * 监听先于 dispose 移除，避免面板销毁过程中触发的 change 事件回调到已卸载组件。
	 */
	onCleanup(() => {
		disposed = true;
		document.removeEventListener("fullscreenchange", onFullscreenChange);
		window.removeEventListener("resize", onWindowResize);
		window.removeEventListener("keydown", onControlKey);
		pane?.dispose();
	});

	// 大屏组件是懒加载的，fallback 铺满整屏，避免切换瞬间露出白底或黑底
	return (
		<>
			<Suspense
				fallback={
					<div
						role="status"
						style={{
							position: "fixed",
							inset: "0",
							display: "grid",
							"place-items": "center",
							background: "#050b18",
							color: "#d7e5ff",
						}}
					>
						正在加载{screenRegistry[currentScreen()].short}大屏…
					</div>
				}
			>
				<Dynamic component={screenRegistry[currentScreen()].component} />
			</Suspense>
			<div
				class="screen-switcher"
				classList={{ dragging: dragging() }}
				style={{
					display: controlsVisible() ? "block" : "none",
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

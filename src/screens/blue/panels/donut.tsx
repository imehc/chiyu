/**
 * 立体环形占比图，纯 SVG 手绘，不依赖 ECharts 或 WebGL。
 * 用椭圆弧模拟俯视透视：环体由顶面扇环、内外侧壁、底座和「抬起」后的侧面拼成，
 * 选中扇区时顶面沿屏幕上移 9 个 viewBox 单位，露出侧壁形成厚度。
 * 由中国视图的 panels/index.tsx 挂载在左侧第一块面板内；
 * 数据为写死的四类占比（单位：亿），无外部接口。
 */
import gsap from "gsap";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

/** 顶面配色：亮色一档，与 sidePalette 的暗色配对表达同一块扇区的受光面与侧面 */
const palette = ["#36efd1", "#62d9ff", "#2a9dcc", "#ffdf84"];
/** 侧壁与底座配色，整体比顶面压暗两档，才能读出一圈「厚度」 */
const sidePalette = ["#128d83", "#236d9f", "#155474", "#947c34"];

/**
 * 把椭圆上的角度换算成 SVG 坐标字符串。
 * 圆心横坐标固定取画布中线 198（viewBox 宽 396）；
 * 角度以度为单位，0° 指向右侧，90° 指向屏幕下方（y 轴向下，与数学极坐标的逆时针方向相反）。
 * @param angle 角度，可为负值或超过 360
 * @param rx 椭圆横半轴
 * @param ry 椭圆纵半轴
 * @param y 椭圆中心的纵坐标，默认 73 即环顶面所在高度
 * @returns "x,y" 形式的坐标对，供 path 的 d 属性直接拼接
 */
function ellipsePoint(angle: number, rx: number, ry: number, y = 73) {
	const radians = (angle * Math.PI) / 180;
	return `${198 + Math.cos(radians) * rx},${y + Math.sin(radians) * ry}`;
}

/**
 * 一段环顶面（扇环）的路径。
 * 外弧 61×34、内弧 40×22，两段弧的 sweep 方向相反，围出一块环形扇面。
 * @param start 起始角（度）
 * @param end 结束角（度），需大于 start
 * @param y 该环面所在的纵向基准，抬升时传入比 73 更小的值
 */
function sector(start: number, end: number, y = 73) {
	// 单段椭圆弧最多表达 180°，超过时要用 large-arc-flag 走大弧，否则会被画成互补的小弧
	const large = end - start > 180 ? 1 : 0;
	return `M${ellipsePoint(start, 61, 34, y)} A61 34 0 ${large} 1 ${ellipsePoint(end, 61, 34, y)} L${ellipsePoint(end, 40, 22, y)} A40 22 0 ${large} 0 ${ellipsePoint(start, 40, 22, y)} Z`;
}

/**
 * 扇区侧壁：同一半径椭圆的上下两条弧（纵向错开 height 形成壁厚）加两条竖边。
 * 这里不做可见性裁剪，跨半周时交给 visibleSectorWall 拆段。
 * @param radius 椭圆横半轴
 * @param height 椭圆纵半轴，与半径一起决定这圈是外壁还是内壁
 * @param top 上沿纵坐标，默认 73
 * @param bottom 下沿纵坐标，默认 84，与 top 相差的 11 就是壁厚
 */
function sectorWall(
	start: number,
	end: number,
	radius: number,
	height: number,
	top = 73,
	bottom = 84,
) {
	const large = end - start > 180 ? 1 : 0;
	return `M${ellipsePoint(start, radius, height, top)} A${radius} ${height} 0 ${large} 1 ${ellipsePoint(end, radius, height, top)} L${ellipsePoint(end, radius, height, bottom)} A${radius} ${height} 0 ${large} 0 ${ellipsePoint(start, radius, height, bottom)} Z`;
}

/**
 * 只保留朝向观察者那半圈的侧壁。
 * 椭圆投影下，环的前半圈（0°~180°，屏幕下半部）露在外面，后半圈被顶面盖住；
 * 内壁正好相反，从中心孔能看到它的后半圈，所以调用时传 visibleStart = 180。
 * 同时以 180° 为单位切段，避免一条 path 跨过半圆导致 large-arc 方向画反。
 * @param visibleStart 可见半周的起点：0 为外壁近侧，180 为内壁远侧
 * @returns 可能由多段子路径拼成的 d 字符串
 */
function visibleSectorWall(
	start: number,
	end: number,
	radius: number,
	height: number,
	visibleStart: 0 | 180,
	top = 73,
	bottom = 84,
) {
	const paths: string[] = [];
	// 把 [start, end] 与每个可见半周 [halfStart, halfStart + 180] 求交集，逐段生成
	const firstTurn = Math.floor((start - visibleStart) / 360);
	const lastTurn = Math.floor((end - visibleStart) / 360);
	for (let turn = firstTurn; turn <= lastTurn; turn++) {
		const halfStart = visibleStart + turn * 360;
		const from = Math.max(start, halfStart);
		const to = Math.min(end, halfStart + 180);
		if (to > from)
			paths.push(sectorWall(from, to, radius, height, top, bottom));
	}
	return paths.join(" ");
}

/**
 * 抬起扇区两侧的径向切口（侧封面）。
 * 只画真正朝外的两面：左切口在 cos(start) < 0 时朝向左侧观察者，右切口在 cos(end) > 0 时朝向右侧；
 * 与相邻扇区贴合的那一侧会被邻块挡住，画出来反而会盖住邻居，所以用余弦符号过滤。
 * @param top 抬起后的顶面高度
 * @param bottom 落地时的顶面高度，通常传 73
 * @param startBottom 起点侧切口的底边高度，取相邻扇区当前抬升量，两块抬升不同步时切口才不会悬空
 * @param endBottom 终点侧切口的底边高度，同上
 */
function raisedSectorEnds(
	start: number,
	end: number,
	top: number,
	bottom: number,
	startBottom = bottom,
	endBottom = bottom,
) {
	const face = (angle: number, lower: number) =>
		`M${ellipsePoint(angle, 61, 34, top)} L${ellipsePoint(angle, 40, 22, top)} L${ellipsePoint(angle, 40, 22, lower)} L${ellipsePoint(angle, 61, 34, lower)} Z`;
	const paths: string[] = [];
	// 1e-6 是浮点容差，避免角度正好等于 90° / 270° 时被判成朝外
	if (top < startBottom && Math.cos((start * Math.PI) / 180) < -1e-6)
		paths.push(face(start, startBottom));
	if (top < endBottom && Math.cos((end * Math.PI) / 180) > 1e-6)
		paths.push(face(end, endBottom));
	return paths.join(" ");
}

/**
 * 立体环形占比图组件。
 * 展示内容：四类数据的占比（数值 400/250/200/150，单位亿），中心实时显示当前选中项的百分比；
 * 响应式依赖：active（点击或自动轮播的选中项）、hovered / focused（悬停与键盘聚焦临时覆盖 active）、
 * lifts（每块扇区当前抬升高度，驱动 SVG 几何）、reducedMotion（系统动效偏好）；
 * 生命周期：onMount 启动 3.6 秒自动轮播并监听动效偏好，onCleanup 清理定时器与 GSAP 补间，
 * createEffect 负责把选中项平滑过渡到抬起状态。
 */
export default function Donut() {
	/** 自动轮播的选中索引 */
	const [active, setActive] = createSignal(0);
	/** 鼠标悬停的扇区，null 表示没有悬停 */
	const [hovered, setHovered] = createSignal<number | null>(null);
	/** 键盘聚焦的扇区，与悬停同级，保证键盘操作也能触发抬起 */
	const [focused, setFocused] = createSignal<number | null>(null);
	// 四类数值，单位亿，合计 1000，中心百分比按 total 折算
	const data = [400, 250, 200, 150];
	const total = data.reduce((sum, value) => sum + value, 0);
	// 角度区间由数值换算而来（400/1000 × 360 = 144° 等），与 data 之间没有联动，改数值时必须同步这里；
	// -90 是用负角表示从 12 点方向起算，跨 0° 的扇区会同时出现负角与大角
	const ranges = [
		[-90, 54],
		[108, 198],
		[198, 270],
		[54, 108],
	];
	// 抬起高度取 9，略小于 11 的壁厚，抬到顶时侧面刚好露出、不会翻出底沿
	const maxLift = 9;
	const raisedTop = 73 - maxLift;
	// elevations 会被 GSAP 逐帧改写属性，lifts 是它的只读投影；
	// 不能直接把可变数组塞进 signal，对象属性变化不会触发响应式更新
	const elevations = data.map(() => ({ height: 0 }));
	const [lifts, setLifts] = createSignal(
		elevations.map((value) => value.height),
	);
	const [reducedMotion, setReducedMotion] = createSignal(false);
	/** 当前抬升补间句柄：切换选中项前必须先 kill，避免两个补间抢同一批 height */
	let liftTween: gsap.core.Tween | undefined;
	/** 把 GSAP 写入的高度夹到 0~maxLift 后发布，防止缓动过冲导致几何错位 */
	const publishLifts = () => {
		setLifts(
			elevations.map((value) => Math.max(0, Math.min(maxLift, value.height))),
		);
	};
	/** 把任意角度归一到 0~360，用于比较跨 0° 的扇区边界 */
	const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
	// 通过「本块起点 = 某块终点」的等式找到左右邻居：抬起时要按邻居的实际高度收边，切口才不会悬空
	const neighbors = ranges.map(([start, end]) => ({
		start: ranges.findIndex(
			(range) => normalizeAngle(range[1]) === normalizeAngle(start),
		),
		end: ranges.findIndex(
			(range) => normalizeAngle(range[0]) === normalizeAngle(end),
		),
	}));
	// 固定「由远及近」的绘制顺序：按扇区中点角度的 sin 值升序（越小越靠上＝越远），
	// 先画后面的块再画前面的块，前排抬起时才能正确压住后排；
	// 同时这条顺序也决定透明命中区的叠放，抬起前排的边缘不会被后排截走鼠标事件
	const topDrawOrder = data
		.map((_, index) => index)
		.sort(
			(a, b) =>
				Math.sin(((ranges[a][0] + ranges[a][1]) * Math.PI) / 360) -
				Math.sin(((ranges[b][0] + ranges[b][1]) * Math.PI) / 360),
		);
	/** 自动轮播定时器句柄 */
	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		/** 动效偏好或组件环境变化时重建轮播：先停旧定时器，减少动效模式下不再自动切换 */
		const updateMotion = () => {
			setReducedMotion(motion.matches);
			clearInterval(timer);
			timer = undefined;
			if (motion.matches) return;
			// 3.6 秒一档，比面板里其它图表的入场动画慢，避免和图表刷新抢注意力
			timer = setInterval(() => {
				// 用户正在悬停或键盘聚焦时暂停轮播，否则选中项会在阅读过程中被抢走
				if (hovered() === null && focused() === null)
					setActive((value) => (value + 1) % data.length);
			}, 3600);
		};
		updateMotion();
		motion.addEventListener("change", updateMotion);
		onCleanup(() => motion.removeEventListener("change", updateMotion));
	});
	onCleanup(() => {
		clearInterval(timer);
		// GSAP 补间挂在全局时间轴上，只清定时器不够，必须显式 kill 掉本组件创建的那一条
		liftTween?.kill();
		gsap.killTweensOf(elevations);
	});
	// 悬停/聚焦优先于自动轮播；鼠标移开后立刻回落到 active，不会有中间态
	const selected = () => hovered() ?? focused() ?? active();
	createEffect(() => {
		const selection = selected();
		const instant = reducedMotion();
		const targets = elevations.map((_, index) =>
			index === selection ? maxLift : 0,
		);
		// 每次选中项或动效偏好变化都要重建补间，先杀掉上一条防止高度被两个 tween 同时改写
		liftTween?.kill();
		liftTween = undefined;
		if (
			instant ||
			elevations.every((value, index) => value.height === targets[index])
		) {
			// 减少动效或高度已到位时直接落位，跳过补间也跳过不必要的逐帧 setSignal
			for (const [index, value] of elevations.entries())
				value.height = targets[index];
			publishLifts();
			return;
		}
		// 0.42s + power2.inOut：起落都快、中段平滑，与 3.6s 的轮播节奏相比显得干脆
		liftTween = gsap.to(elevations, {
			height: (index: number) => targets[index],
			duration: 0.42,
			ease: "power2.inOut",
			overwrite: true,
			onUpdate: publishLifts,
			onComplete: () => {
				for (const [index, value] of elevations.entries())
					value.height = targets[index];
				publishLifts();
				liftTween = undefined;
			},
		});
	});
	// viewBox 396×146 是设计基准，CSS 里高度固定、宽度随面板拉伸，靠等比缩放保证椭圆不变形。
	// 图层由后到前：地面辉光 → 装饰圆环 → 底座 → 顶面暗槽 → 底部投影扇环 → 可见侧壁 →
	// 顶面扇区（各带一块透明命中区）→ 抬起块补绘的侧壁与顶面 → 中心数值文字；图例是 DOM 层，不受 SVG 缩放影响。
	// 扇区渐变统一用 userSpaceOnUse + 固定的 y1/y2，四块共用同一条竖向光照，避免各自包围盒不同导致明暗不一致。
	return (
		<div class="blue-donut">
			{/* biome-ignore lint/a11y/useSemanticElements: Interactive SVG sectors require an SVG container rather than a fieldset. */}
			<svg viewBox="0 0 396 146" role="group" aria-label="四类数据占比环形图">
				<defs>
					<radialGradient id="blue-donut-glow">
						<stop stop-color="#007bc3" stop-opacity=".35" />
						<stop offset="1" stop-color="#002034" stop-opacity="0" />
					</radialGradient>
					<linearGradient id="blue-donut-platform" x2="0" y2="1">
						<stop stop-color="#104e7c" />
						<stop offset="1" stop-color="#06152c" />
					</linearGradient>
					<For each={palette}>
						{(color, index) => (
							<linearGradient
								id={`blue-donut-sector-${index()}`}
								gradientUnits="userSpaceOnUse"
								x1="198"
								y1="39"
								x2="198"
								y2="107"
							>
								<stop stop-color={color} />
								<stop offset=".55" stop-color={color} />
								<stop offset="1" stop-color={sidePalette[index()]} />
							</linearGradient>
						)}
					</For>
				</defs>
				<ellipse
					cx="198"
					cy="95"
					rx="102"
					ry="52"
					fill="url(#blue-donut-glow)"
				/>
				<ellipse
					cx="198"
					cy="91"
					rx="91"
					ry="45"
					fill="none"
					stroke="#12bfc7"
					stroke-width="1.2"
					opacity=".5"
				/>
				<ellipse
					cx="198"
					cy="87"
					rx="83"
					ry="41"
					fill="url(#blue-donut-platform)"
					stroke="#174878"
					stroke-width="3"
				/>
				<ellipse
					cx="198"
					cy="79"
					rx="75"
					ry="37"
					fill="#082139"
					stroke="#187bba"
					stroke-width="4"
				/>
				{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: This decorative SVG group has no tabindex or handlers; only top faces receive focus. */}
				<g class="blue-donut-bottom" aria-hidden="true" pointer-events="none">
					<For each={data}>
						{(_, index) => (
							<path
								d={sector(ranges[index()][0], ranges[index()][1], 84)}
								fill={sidePalette[index()]}
							/>
						)}
					</For>
				</g>
				{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: This decorative SVG group has no tabindex or handlers; only top faces receive focus. */}
				<g class="blue-donut-walls" aria-hidden="true" pointer-events="none">
					<For each={data}>
						{(_, index) => (
							<>
								<path
									d={visibleSectorWall(
										ranges[index()][0],
										ranges[index()][1],
										61,
										34,
										0,
									)}
									fill={sidePalette[index()]}
								/>
								<path
									d={visibleSectorWall(
										ranges[index()][0],
										ranges[index()][1],
										40,
										22,
										180,
									)}
									fill={sidePalette[index()]}
								/>
							</>
						)}
					</For>
				</g>
				<g class="blue-donut-top">
					<For each={topDrawOrder}>
						{(index) => (
							// biome-ignore lint/a11y/useSemanticElements: An SVG sector needs an SVG group; keyboard activation is supplied.
							<g
								class="blue-donut-sector"
								role="button"
								tabIndex={0}
								aria-label={`查看类型${index + 1}占比`}
								aria-pressed={selected() === index}
								onMouseEnter={() => setHovered(index)}
								onMouseLeave={() => setHovered(null)}
								onFocus={() => setFocused(index)}
								onBlur={() => setFocused(null)}
								onClick={() => setActive(index)}
								onKeyDown={(event) => {
									// Enter 与空格是 role="button" 的约定激活键；空格默认会滚动页面，必须阻止
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										setActive(index);
									}
								}}
							>
								<path
									class="blue-donut-face"
									d={sector(ranges[index][0], ranges[index][1])}
									fill={`url(#blue-donut-sector-${index})`}
									stroke={palette[index]}
									stroke-width=".7"
									stroke-opacity={Math.max(0, 1 - lifts()[index] / 0.5)}
								/>
								<path
									class="blue-donut-raised-hit"
									d={sector(ranges[index][0], ranges[index][1], raisedTop)}
									fill="transparent"
									pointer-events="all"
								/>
								<title>{`类型${index + 1}：${data[index]}，${(data[index] / total) * 100}%`}</title>
							</g>
						)}
					</For>
				</g>
				<For each={topDrawOrder}>
					{(index) => {
						const [start, end] = ranges[index];
						// 抬升高度每次从 signal 取最新值并重算路径，而不是用 CSS transform：
						// 椭圆透视下整体位移会连带缩放壁厚，几何必须逐帧重建
						const height = () => lifts()[index];
						const top = () => 73 - height();
						return (
							<Show when={height() > 0}>
								{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: Raised paint is decorative; the stable sector buttons provide its complete hit area. */}
								<g
									class="blue-donut-raised"
									aria-hidden="true"
									pointer-events="none"
									data-sector={index + 1}
									data-lift={height().toFixed(3)}
								>
									<path
										class="blue-donut-raised-side"
										d={visibleSectorWall(start, end, 61, 34, 0, top(), 73)}
										fill={sidePalette[index]}
									/>
									<path
										class="blue-donut-raised-side"
										d={visibleSectorWall(start, end, 40, 22, 180, top(), 73)}
										fill={sidePalette[index]}
									/>
									<path
										class="blue-donut-raised-side"
										d={raisedSectorEnds(
											start,
											end,
											top(),
											73,
											73 - (lifts()[neighbors[index].start] ?? 0),
											73 - (lifts()[neighbors[index].end] ?? 0),
										)}
										fill={sidePalette[index]}
									/>
									<path
										class="blue-donut-face blue-donut-raised-face"
										d={sector(start, end, top())}
										fill={`url(#blue-donut-sector-${index})`}
										stroke={palette[index]}
										stroke-width={0.7 + (height() / maxLift) * 0.5}
										style={{
											filter: `brightness(${1 + (height() / maxLift) * 0.12})`,
										}}
									/>
								</g>
							</Show>
						);
					}}
				</For>
				<text x="198" y="71" class="blue-donut-number">
					{((data[selected()] / total) * 100).toFixed(2)} %
				</text>
				<text x="198" y="83" class="blue-donut-subtitle">
					类型{selected() + 1}
				</text>
			</svg>
			<div class="blue-donut-legend">
				<For each={data}>
					{(value, index) => (
						<div>
							<span>类型{index() + 1}</span>
							<strong>
								<i style={{ "border-color": palette[index()] }} />
								{value}
								<em>亿</em>
							</strong>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

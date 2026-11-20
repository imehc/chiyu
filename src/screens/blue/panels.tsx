import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import gsap from "gsap";
import {
	createEffect,
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import "./panels.css";
import { applyBlueChartTheme } from "./chart-theme";
import BlueIcon from "./icons";
import BluePanelFrame from "./panel-frame";

const palette = ["#36efd1", "#62d9ff", "#2a9dcc", "#ffdf84"];
const sidePalette = ["#128d83", "#236d9f", "#155474", "#947c34"];
const textColor = "#d4edf8";
const axis = {
	axisLine: { lineStyle: { color: "#173c52" } },
	axisTick: { show: false },
	axisLabel: { color: textColor, fontSize: 10, fontFamily: "D-DIN" },
};
const tooltip = {
	trigger: "axis" as const,
	backgroundColor: "rgba(2,24,42,.96)",
	borderColor: "#237aa5",
	textStyle: { color: "#d4f8ff", fontSize: 12 },
	axisPointer: { type: "line" as const, lineStyle: { color: "#4dc4e9" } },
};
const legend = {
	top: 7,
	right: 13,
	icon: "rect",
	itemWidth: 8,
	itemHeight: 3,
	itemGap: 10,
	textStyle: { color: "#91b8ce", fontSize: 10 },
};
const fade = (top: string, bottom = "rgba(11,54,85,.02)") =>
	new graphic.LinearGradient(0, 0, 0, 1, [
		{ offset: 0, color: top },
		{ offset: 1, color: bottom },
	]);

function Panel(props: { side?: "left" | "right"; children: JSX.Element }) {
	return (
		<section
			class={`blue-panel ${props.side === "right" ? "blue-panel-right" : ""}`}
		>
			<BluePanelFrame />
			<div class="blue-panel-title">
				<i class="blue-panel-status" aria-hidden="true" />
				<span>一级小标题</span>
				<i class="blue-title-dots" aria-hidden="true">
					<span />
					<span />
					<span />
				</i>
			</div>
			<div class="blue-panel-content">{props.children}</div>
		</section>
	);
}

type ChartOption =
	| EChartsOption
	| ((width: number, height: number) => EChartsOption);

function Chart(props: { option: ChartOption; label: string }) {
	let el!: HTMLDivElement;
	let chart: ECharts | undefined;
	let observer: ResizeObserver | undefined;
	onMount(() => {
		chart = init(el, undefined, { renderer: "canvas" });
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let previousSize: { width: number; height: number } | undefined;
		const applyOption = () => {
			if (!chart) return;
			const option =
				typeof props.option === "function"
					? props.option(chart.getWidth(), chart.getHeight())
					: props.option;
			chart.setOption(applyBlueChartTheme(option, motion.matches));
		};
		const update = () => {
			if (!chart) return;
			const width = el.clientWidth;
			const height = el.clientHeight;
			if (
				!width ||
				!height ||
				(previousSize?.width === width && previousSize?.height === height)
			)
				return;
			const firstRender = !previousSize;
			previousSize = { width, height };
			chart.resize();
			if (firstRender || typeof props.option === "function") applyOption();
		};
		update();
		observer = new ResizeObserver(update);
		observer.observe(el);
		motion.addEventListener("change", applyOption);
		onCleanup(() => motion.removeEventListener("change", applyOption));
	});
	onCleanup(() => {
		observer?.disconnect();
		chart?.dispose();
	});
	return (
		<div class="blue-chart" ref={el} role="img" aria-label={props.label} />
	);
}

function ellipsePoint(angle: number, rx: number, ry: number, y = 73) {
	const radians = (angle * Math.PI) / 180;
	return `${198 + Math.cos(radians) * rx},${y + Math.sin(radians) * ry}`;
}

function sector(start: number, end: number, y = 73) {
	const large = end - start > 180 ? 1 : 0;
	return `M${ellipsePoint(start, 61, 34, y)} A61 34 0 ${large} 1 ${ellipsePoint(end, 61, 34, y)} L${ellipsePoint(end, 40, 22, y)} A40 22 0 ${large} 0 ${ellipsePoint(start, 40, 22, y)} Z`;
}

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
	if (top < startBottom && Math.cos((start * Math.PI) / 180) < -1e-6)
		paths.push(face(start, startBottom));
	if (top < endBottom && Math.cos((end * Math.PI) / 180) > 1e-6)
		paths.push(face(end, endBottom));
	return paths.join(" ");
}

function Donut() {
	const [active, setActive] = createSignal(0);
	const [hovered, setHovered] = createSignal<number | null>(null);
	const [focused, setFocused] = createSignal<number | null>(null);
	const data = [400, 250, 200, 150];
	const total = data.reduce((sum, value) => sum + value, 0);
	const ranges = [
		[-90, 54],
		[108, 198],
		[198, 270],
		[54, 108],
	];
	const maxLift = 9;
	const raisedTop = 73 - maxLift;
	const elevations = data.map(() => ({ height: 0 }));
	const [lifts, setLifts] = createSignal(
		elevations.map((value) => value.height),
	);
	const [reducedMotion, setReducedMotion] = createSignal(false);
	let liftTween: gsap.core.Tween | undefined;
	const publishLifts = () => {
		setLifts(
			elevations.map((value) => Math.max(0, Math.min(maxLift, value.height))),
		);
	};
	const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
	const neighbors = ranges.map(([start, end]) => ({
		start: ranges.findIndex(
			(range) => normalizeAngle(range[1]) === normalizeAngle(start),
		),
		end: ranges.findIndex(
			(range) => normalizeAngle(range[0]) === normalizeAngle(end),
		),
	}));
	// Fixed back-to-front hit order also covers an elevated front sector's edges.
	const topDrawOrder = data
		.map((_, index) => index)
		.sort(
			(a, b) =>
				Math.sin(((ranges[a][0] + ranges[a][1]) * Math.PI) / 360) -
				Math.sin(((ranges[b][0] + ranges[b][1]) * Math.PI) / 360),
		);
	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateMotion = () => {
			setReducedMotion(motion.matches);
			clearInterval(timer);
			timer = undefined;
			if (motion.matches) return;
			timer = setInterval(() => {
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
		liftTween?.kill();
		gsap.killTweensOf(elevations);
	});
	const selected = () => hovered() ?? focused() ?? active();
	createEffect(() => {
		const selection = selected();
		const instant = reducedMotion();
		const targets = elevations.map((_, index) =>
			index === selection ? maxLift : 0,
		);
		liftTween?.kill();
		liftTween = undefined;
		if (
			instant ||
			elevations.every((value, index) => value.height === targets[index])
		) {
			for (const [index, value] of elevations.entries())
				value.height = targets[index];
			publishLifts();
			return;
		}
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

function RowIcon(props: { index: number }) {
	return (
		<BlueIcon
			name={
				["building", "truck", "ship", "plane", "tools", "factory"][
					props.index % 6
				]
			}
			size={20}
		/>
	);
}

function DataRows() {
	const [start, setStart] = createSignal(0);
	const [moving, setMoving] = createSignal(false);
	let timer: ReturnType<typeof setInterval> | undefined;
	let moveTimer: ReturnType<typeof setTimeout> | undefined;
	onMount(() => {
		timer = setInterval(() => {
			setMoving(true);
			moveTimer = setTimeout(() => {
				setStart((value) => (value + 1) % 4);
				setMoving(false);
			}, 650);
		}, 5000);
	});
	onCleanup(() => {
		clearInterval(timer);
		clearTimeout(moveTimer);
	});
	return (
		<div class="blue-data-rows">
			<div class="blue-data-rows-viewport">
				<div class="blue-data-row-list" classList={{ moving: moving() }}>
					<For each={[0, 1, 2, 3, 0]}>
						{(item) => (
							<div class="blue-data-row">
								<RowIcon index={(item + start()) % 4} />
								<span class="blue-data-name">数据名称</span>
								<div>
									<small>正常</small>
									<b>62</b>
								</div>
								<div>
									<small>告警</small>
									<b>62</b>
								</div>
								<div>
									<small>总数</small>
									<strong>118</strong>
								</div>
							</div>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}

function Gauge(props: { value: number; index: number }) {
	const colors = ["#36ead6", "#57baff", "#53bcff"];
	return (
		<div class="blue-gauge">
			<svg
				viewBox="0 0 115 100"
				role="img"
				aria-label={`数据${props.index + 1} ${props.value}`}
			>
				<defs>
					<linearGradient
						id={`blue-gauge-gradient-${props.index}`}
						x1="0"
						y1="1"
						x2="1"
						y2="0"
					>
						<stop stop-color={colors[props.index]} />
						<stop offset="1" stop-color="#ddfaff" />
					</linearGradient>
				</defs>
				<path
					d="M22.9 67A40 40 0 1 1 92.1 67"
					fill="none"
					stroke="#133048"
					stroke-width="10"
				/>
				<path
					d="M26.3 65A36 36 0 1 1 88.7 65"
					fill="none"
					stroke="#486174"
					stroke-width="4"
					opacity=".65"
				/>
				<path
					d="M26.3 65A36 36 0 0 1 80.6 19.4"
					fill="none"
					stroke={`url(#blue-gauge-gradient-${props.index})`}
					stroke-width="4.5"
				/>
				<path
					d="M29.8 63A32 32 0 1 1 85.2 63"
					fill="none"
					stroke="#244b65"
					stroke-width="1"
				/>
				<text x="57.5" y="51" class="blue-gauge-value">
					{props.value}
				</text>
				<text x="57.5" y="65" class="blue-gauge-unit">
					单位
				</text>
				<text x="57.5" y="78" class="blue-gauge-label">
					数据{["一", "二", "三"][props.index]}
				</text>
			</svg>
		</div>
	);
}

function Gauges() {
	const [percentage, setPercentage] = createSignal(60);
	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		timer = setInterval(
			() => setPercentage((value) => (value >= 90 ? 30 : value + 10)),
			4200,
		);
	});
	onCleanup(() => clearInterval(timer));
	return (
		<div class="blue-gauges-panel">
			<div class="blue-gauges">
				<For each={[546, 642, 457]}>
					{(value, index) => <Gauge value={value} index={index()} />}
				</For>
			</div>
			<div class="blue-gauges-table">
				<div class="blue-gauges-table-head">
					<span>名称</span>
					<span>数据</span>
					<span>数据</span>
					<span>占比</span>
				</div>
				<For each={[0, 1]}>
					{(row) => (
						<div class="blue-gauges-table-row">
							<span>数据名称</span>
							<span>
								462<small>单位</small>
							</span>
							<span>
								462<small>单位</small>
							</span>
							<span>
								<i />
								{row ? (percentage() + 10) % 100 : percentage()}%
							</span>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

const sales: EChartsOption = {
	animationDuration: 1400,
	tooltip,
	legend: { ...legend, data: ["数据一", "数据二", "数据三"] },
	grid: { top: 37, left: 50, right: 24, bottom: 30 },
	xAxis: {
		...axis,
		type: "category",
		data: [
			"03-24",
			"03-25",
			"03-26",
			"03-27",
			"03-28",
			"03-29",
			"03-30",
			"03-31",
		],
		axisLabel: { ...axis.axisLabel, interval: 0 },
	},
	yAxis: {
		...axis,
		type: "value",
		max: 250,
		interval: 50,
		name: "单位",
		nameTextStyle: { color: textColor, fontSize: 10 },
		splitLine: { lineStyle: { color: "#10304b", opacity: 0.4 } },
	},
	series: [
		{
			name: "数据一",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#f5d463", "#625224") },
			data: [120, 195, 154, 76, 78, 110, 126, 143],
		},
		{
			name: "数据二",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#16d6bd", "#074b54") },
			data: [181, 249, 165, 88, 102, 125, 140, 119],
		},
		{
			name: "数据三",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#39bfff", "#103456") },
			data: [101, 188, 170, 66, 92, 136, 155, 176],
		},
	],
};

const economy: EChartsOption = {
	animationDuration: 1700,
	tooltip,
	legend: { ...legend, data: ["2022年", "2023年"] },
	grid: { top: 37, left: 54, right: 27, bottom: 29 },
	xAxis: {
		...axis,
		type: "category",
		boundaryGap: false,
		data: [
			"2022/04",
			"2022/05",
			"2022/06",
			"2022/07",
			"2022/08",
			"2022/09",
			"2022/10",
			"2022/11",
			"2022/12",
			"2023/01",
			"2023/02",
			"2024/02",
		],
		axisLabel: {
			...axis.axisLabel,
			interval: (index) => [0, 2, 4, 6, 8, 11].includes(index),
		},
	},
	yAxis: {
		...axis,
		type: "value",
		max: 1500,
		interval: 300,
		name: "单位",
		nameTextStyle: { color: textColor, fontSize: 10 },
		axisLine: { show: false },
		splitLine: { lineStyle: { color: "#0c2840", opacity: 0.28 } },
	},
	series: [
		{
			name: "2022年",
			type: "line",
			smooth: 0.55,
			symbol: "none",
			lineStyle: { color: "#81d8fb", width: 2 },
			itemStyle: { color: "#7edbfb" },
			areaStyle: {
				color: fade("rgba(52,132,184,.68)", "rgba(23,88,124,.12)"),
				opacity: 1,
			},
			data: [1200, 700, 500, 700, 1300, 650, 1250, 600, 1050, 450, 1000, 400],
		},
		{
			name: "2023年",
			type: "line",
			smooth: 0.55,
			symbol: "none",
			lineStyle: { color: "#31d3b7", width: 2 },
			itemStyle: { color: "#31d3b7" },
			areaStyle: {
				color: fade("rgba(36,205,162,.65)", "rgba(13,83,84,.08)"),
				opacity: 1,
			},
			data: [450, 950, 1100, 600, 400, 1000, 1200, 800, 1050, 650, 300, 150],
		},
	],
};

const monthly: EChartsOption = {
	animationDuration: 1500,
	tooltip,
	legend: { ...legend, data: ["类型1", "类型2", "类型3"] },
	grid: { top: 36, left: 48, right: 25, bottom: 29 },
	xAxis: {
		...axis,
		type: "category",
		data: ["一月", "二月", "三月", "四月", "五月", "六月"],
		axisLabel: { ...axis.axisLabel, interval: 0 },
	},
	yAxis: {
		...axis,
		type: "value",
		max: 150,
		interval: 30,
		name: "单位",
		nameTextStyle: { color: textColor, fontSize: 10 },
		splitLine: { lineStyle: { color: "#15354c", opacity: 0.35 } },
	},
	series: [
		{
			name: "类型1",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#73e0cd", "#0d4354") },
			data: [100, 120, 130, 110, 120, 130],
		},
		{
			name: "类型2",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#5ebcf7", "#16384b") },
			data: [62, 100, 150, 90, 140, 110],
		},
		{
			name: "类型3",
			type: "line",
			symbol: "circle",
			symbolSize: 3,
			lineStyle: { color: "#a6d8ff", width: 1.7 },
			itemStyle: { color: "#d2eeff" },
			data: [52, 15, 97, 32, 100, 69],
		},
	],
};

const globeDonut: EChartsOption = {
	animationDuration: 1500,
	tooltip: { ...tooltip, trigger: "item" },
	legend: {
		orient: "vertical",
		right: 25,
		top: 32,
		itemWidth: 7,
		itemHeight: 7,
		icon: "circle",
		itemGap: 23,
		textStyle: { color: "#e0f2ff", fontSize: 12 },
		formatter: (name) =>
			`${name}             ${[3254, 2145, 1278, 654][["数据一", "数据二", "数据三", "数据四"].indexOf(name)]} ↑`,
	},
	series: [
		{
			type: "pie",
			radius: ["46%", "55%"],
			center: ["22.1%", "48%"],
			startAngle: 70,
			label: { show: false },
			labelLine: { show: false },
			itemStyle: { borderWidth: 0 },
			emphasis: { scaleSize: 4 },
			data: [
				{ value: 3254, name: "数据一", itemStyle: { color: "#13adff" } },
				{ value: 2145, name: "数据二", itemStyle: { color: "#f9d04c" } },
				{ value: 1278, name: "数据三", itemStyle: { color: "#16d3b9" } },
				{ value: 654, name: "数据四", itemStyle: { color: "#1768d6" } },
			],
		},
	],
};

function globeDonutOption(width: number, height: number): EChartsOption {
	const scale = Math.min(width / 380, height / 192);
	const x = width * 0.221;
	const y = height * 0.48;
	return {
		...globeDonut,
		graphic: [
			{
				type: "circle",
				shape: { cx: x, cy: y, r: 63 * scale },
				style: { fill: "none", stroke: "#08365c", lineWidth: 4 * scale },
			},
			{
				type: "circle",
				shape: { cx: x, cy: y, r: 39 * scale },
				style: { fill: "#061e36", stroke: "#1a608d", lineWidth: 3 * scale },
			},
			{
				type: "text",
				x,
				y: y - 6 * scale,
				style: {
					text: "7331",
					align: "center",
					verticalAlign: "middle",
					fill: "#e8faff",
					fontSize: 17 * scale,
					fontFamily: "D-DIN",
				},
			},
			{
				type: "text",
				x,
				y: y + 12 * scale,
				style: {
					text: "总计",
					align: "center",
					fill: "#e8faff",
					fontSize: 11 * scale,
				},
			},
		],
	};
}

const pointedColumns: EChartsOption = {
	animationDuration: 1600,
	tooltip,
	grid: { top: 39, left: 47, right: 25, bottom: 28 },
	xAxis: {
		...axis,
		type: "category",
		data: [
			"03-24",
			"03-25",
			"03-26",
			"03-27",
			"03-28",
			"03-29",
			"03-30",
			"03-31",
		],
		axisLabel: { ...axis.axisLabel, interval: 0 },
	},
	yAxis: {
		...axis,
		type: "value",
		name: "单位",
		max: 100,
		interval: 20,
		nameTextStyle: { color: textColor, fontSize: 10 },
		splitLine: { lineStyle: { color: "#123047", opacity: 0.3 } },
	},
	series: [
		{
			type: "custom",
			name: "数据",
			encode: { x: 0, y: 1 },
			renderItem: (_params, api) => {
				const [x, top] = api.coord([api.value(0), api.value(1)]);
				const bottom = api.coord([api.value(0), 0])[1];
				const color = Number(api.value(0)) % 3 ? "#36dcc5" : "#46c9ff";
				return {
					type: "group",
					children: [
						{
							type: "path",
							shape: {
								pathData: `M${x - 9},${bottom} Q${x - 3},${bottom - 5} ${x - 1.5},${top + 5} L${x},${top} L${x + 1.5},${top + 5} Q${x + 3},${bottom - 5} ${x + 9},${bottom} Z`,
							},
							style: {
								fill: fade(color, "rgba(12,96,115,.08)"),
								shadowColor: color,
								shadowBlur: 6,
							},
						},
						{
							type: "circle",
							shape: { cx: x, cy: top, r: 2.3 },
							style: { fill: "#d3ffff", shadowBlur: 7, shadowColor: color },
						},
						{
							type: "text",
							x,
							y: top - 13,
							style: {
								text: String(api.value(1)),
								align: "center",
								fill: "#d4f8ff",
								fontSize: 10,
								fontFamily: "D-DIN",
							},
						},
					],
				};
			},
			data: [70, 47, 60, 84, 52, 63, 42, 63].map((value, index) => [
				index,
				value,
			]),
		},
	],
};

function MetricCards() {
	return (
		<div class="blue-metric-cards">
			<For each={[3425, 3225, 3011, 2825, 2472, 2198]}>
				{(value, index) => (
					<div class="blue-metric-card">
						<div class="blue-metric-icon">
							<i />
							<RowIcon index={index()} />
						</div>
						<div>
							<small>数据{["一", "二", "三", "四", "五", "六"][index()]}</small>
							<strong>
								{value}
								<em>单位</em>
							</strong>
						</div>
					</div>
				)}
			</For>
		</div>
	);
}

export function BlueLeftPanels(props: { globe?: boolean } = {}) {
	return (
		<div class="blue-panel-column">
			<Panel>
				<Show when={props.globe} fallback={<Donut />}>
					<div class="blue-flat-donut">
						<Chart option={globeDonutOption} label="全球四类数据占比总计7331" />
					</div>
				</Show>
			</Panel>
			<Panel>
				<Show
					when={props.globe}
					fallback={<Chart option={sales} label="三类数据三月销售趋势" />}
				>
					<Chart option={pointedColumns} label="三月每日数据走势" />
				</Show>
			</Panel>
			<Panel>
				<Show when={props.globe} fallback={<DataRows />}>
					<MetricCards />
				</Show>
			</Panel>
		</div>
	);
}

export function BlueRightPanels(props: { globe?: boolean } = {}) {
	return (
		<div class="blue-panel-column">
			<Panel side="right">
				<Gauges />
			</Panel>
			<Panel side="right">
				<Show
					when={props.globe}
					fallback={<Chart option={economy} label="2022年和2023年经济趋势" />}
				>
					<Chart option={sales} label="三类数据三月销售趋势" />
				</Show>
			</Panel>
			<Panel side="right">
				<Show
					when={props.globe}
					fallback={<Chart option={monthly} label="各月份分类数据及增长趋势" />}
				>
					<DataRows />
				</Show>
			</Panel>
		</div>
	);
}

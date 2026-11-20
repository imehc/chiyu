import gsap from "gsap";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

const palette = ["#36efd1", "#62d9ff", "#2a9dcc", "#ffdf84"];
const sidePalette = ["#128d83", "#236d9f", "#155474", "#947c34"];

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

export default function Donut() {
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

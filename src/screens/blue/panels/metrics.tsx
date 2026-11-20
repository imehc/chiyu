import { createSignal, For, onCleanup, onMount } from "solid-js";
import BlueIcon from "../icons";

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

export function DataRows() {
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

export function Gauges() {
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

export function MetricCards() {
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

/**
 * 蓝色大屏面板里的非 ECharts 组件：滚动明细行、半圆仪表盘与指标卡。
 * 由同目录 index.tsx 按当前视图决定挂载哪一个，全部是写死的演示数据，
 * 定时器节奏（轮播间隔、位移时长）由本文件内的常量与 CSS 过渡共同决定。
 */
import { createSignal, For, onCleanup, onMount } from "solid-js";
import BlueIcon from "../icons";

/**
 * 明细行/指标卡共用的小图标。
 * 六个图标循环取用，让每行看起来对应不同业态；
 * @param props.index 任意整数，内部对 6 取模，所以滚动偏移变化时图标不会越界
 */
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

/**
 * 明细列表的四行纵向轮播。
 * 展示内容：名称、正常/告警/总数三个计数（均为演示值，三列数字之间没有求和关系）；
 * 响应式依赖：start 为当前首行索引，moving 控制是否处于位移动画中；
 * 生命周期：onMount 起一个 5 秒循环的定时器，onCleanup 必须同时清掉 interval 与 timeout。
 */
export function DataRows() {
	const [start, setStart] = createSignal(0);
	const [moving, setMoving] = createSignal(false);
	/** 轮播间隔句柄 */
	let timer: ReturnType<typeof setInterval> | undefined;
	/** 单次位移的收尾定时器，与 transition 时长对齐 */
	let moveTimer: ReturnType<typeof setTimeout> | undefined;
	onMount(() => {
		timer = setInterval(() => {
			setMoving(true);
			// 650ms 必须与 CSS 中 .blue-data-row-list.moving 的过渡时长一致，
			// 否则索引会在动画结束前复位，出现跳动
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
	// 列表固定渲染 5 行：第 5 行是首行的副本，上移一行后仍能填满视口，随后复位索引实现无缝循环
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

/**
 * 单个半圆仪表。
 * 一共四道弧：10px 粗的外圈底槽、4px 的刻度底轨、4.5px 的渐变进度弧、1px 的内圈细线；
 * 进度弧的角度是固定的，并没有按 value 映射，数值只以中心文本展示（演示数据）。
 * @param props.value 中心大字数值，单位由下方固定文案说明
 * @param props.index 0~2，同时决定渐变 id 与颜色，避免多个仪表共用同一个渐变定义互相覆盖
 */
function Gauge(props: { value: number; index: number }) {
	/** 三个仪表各用一档主色，与面板其它图表的青蓝系保持一致 */
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

/**
 * 仪表盘面板：上方三个半圆仪表，下方两行数据表。
 * 展示内容：仪表数值是常量（546/642/457），表格里的占比由 percentage 信号驱动，
 * 每 4.2 秒自增 10，越过 90 后回到 30，形成小幅循环跳动。
 * 生命周期：onMount 起定时器，onCleanup 清除，避免面板卸载后继续改信号。
 */
export function Gauges() {
	const [percentage, setPercentage] = createSignal(60);
	/** 占比循环的定时器句柄 */
	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		timer = setInterval(
			// 信号值只在 30~90 之间循环；第二行取 (percentage + 10) % 100，90 时会显示 0%
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

/**
 * 指标卡宫格：2 列 × 3 行共 6 张卡。
 * 展示内容：图标（按索引轮换）、卡名（数据一…数据六）与主数值，数值为演示用的四位数，
 * 单位统一写「单位」占位，接入真实数据时把数值与单位一并替换即可。
 * 纯展示组件，无信号与生命周期副作用，入场浮动动画由 CSS 负责。
 */
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

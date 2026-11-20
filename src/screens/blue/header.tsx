import { createUniqueId, For } from "solid-js";
import BlueLineFlow from "./line-flow";
import "./header.css";

interface BlueHeaderProps {
	clock: string;
	activeNav: number;
	onNavigate: (index: number) => void;
}

const rim = "M0 18H688L735 66H919L929 60H991L1001 66H1185L1232 18H1920";
const flowPaths = [
	"M0 18H688L735 66H919L929 60H960",
	"M1920 18H1232L1185 66H1001L991 60H960",
];
const navigation = [
	{ side: "left", labels: ["经济概览", "一级按钮", "一级按钮"], offset: 0 },
	{ side: "right", labels: ["一级按钮", "一级按钮", "一级按钮"], offset: 3 },
];

export default function BlueHeader(props: BlueHeaderProps) {
	const id = createUniqueId();
	const fill = `blue-header-fill-${id}`;
	const edge = `blue-header-edge-${id}`;
	const glow = `blue-header-glow-${id}`;
	const grid = `blue-header-grid-${id}`;
	const circuit = `blue-header-circuit-${id}`;
	const menuFill = `blue-header-menu-fill-${id}`;
	const menuActive = `blue-header-menu-active-${id}`;
	const menuEdge = `blue-header-menu-edge-${id}`;
	return (
		<header class="blue-header blue-command-header">
			<svg
				class="blue-header-art"
				viewBox="0 0 1920 76"
				preserveAspectRatio="none"
				fill="none"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#031122" stop-opacity=".88" />
						<stop offset=".55" stop-color="#062949" stop-opacity=".72" />
						<stop offset="1" stop-color="#0b5280" stop-opacity=".92" />
					</linearGradient>
					<linearGradient id={edge} x1="0" y1="0" x2="1" y2="0">
						<stop stop-color="#125d87" stop-opacity=".35" />
						<stop offset=".28" stop-color="#238abd" stop-opacity=".65" />
						<stop offset=".37" stop-color="#27e5f5" />
						<stop offset=".43" stop-color="#329dce" />
						<stop offset=".5" stop-color="#3aa0d5" stop-opacity=".68" />
						<stop offset=".57" stop-color="#329dce" />
						<stop offset=".63" stop-color="#27e5f5" />
						<stop offset=".72" stop-color="#238abd" stop-opacity=".65" />
						<stop offset="1" stop-color="#125d87" stop-opacity=".35" />
					</linearGradient>
					<linearGradient id={menuFill} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#07172d" stop-opacity=".18" />
						<stop offset=".65" stop-color="#093555" stop-opacity=".55" />
						<stop offset="1" stop-color="#12628e" stop-opacity=".82" />
					</linearGradient>
					<linearGradient id={menuActive} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#092344" stop-opacity=".35" />
						<stop offset=".65" stop-color="#105282" stop-opacity=".9" />
						<stop offset="1" stop-color="#158dcc" />
					</linearGradient>
					<linearGradient id={menuEdge} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#1c5a83" stop-opacity="0" />
						<stop offset=".55" stop-color="#2a87b7" stop-opacity=".7" />
						<stop offset="1" stop-color="#3ac8f4" />
					</linearGradient>
					<filter id={glow} x="-10%" y="-100%" width="120%" height="300%">
						<feGaussianBlur stdDeviation="3.5" />
					</filter>
					<pattern
						id={grid}
						width="88"
						height="32"
						patternUnits="userSpaceOnUse"
					>
						<path d="M88 0H0V32" stroke="#6dceff" stroke-opacity=".08" />
						<path
							d="M40 16H48M44 12V20"
							stroke="#6dceff"
							stroke-opacity=".12"
						/>
					</pattern>
					<pattern
						id={circuit}
						width="26"
						height="9"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M0 8V1H6V7H12V1H18V7H24V1"
							stroke="#2887b1"
							stroke-opacity=".16"
							stroke-width="2"
						/>
					</pattern>
				</defs>
				<path
					d="M0 0H1920V18H1232L1185 66H1001L991 60H929L919 66H735L688 18H0Z"
					fill={`url(#${fill})`}
				/>
				<path d="M690 0H1230V18L1183 64H737L690 18Z" fill={`url(#${grid})`} />
				<path
					d="M8 4H656V12H8ZM1264 4H1912V12H1264Z"
					fill={`url(#${circuit})`}
				/>
				<path
					d="M0 23H684L731 71H1189L1236 23H1920"
					stroke="#13577d"
					stroke-opacity=".4"
				/>
				<path
					d={rim}
					stroke={`url(#${edge})`}
					stroke-width="6"
					opacity=".65"
					filter={`url(#${glow})`}
				/>
				<path
					d={rim}
					stroke={`url(#${edge})`}
					stroke-width="2"
					stroke-linejoin="round"
				/>
				<path
					d="M0 70H664L681 58M1920 70H1256L1239 58"
					stroke="#123b5b"
					stroke-opacity=".65"
				/>
				<BlueLineFlow paths={flowPaths} begin="-1.4s" />
				<path
					class="blue-header-gold-glow"
					d="M926 64H994"
					stroke="#f9cb4c"
					stroke-width="4"
					filter={`url(#${glow})`}
				/>
				<path d="M923 66L928 63H992L997 66Z" fill="#f6c44b" />
				<path
					d="M762 59H766M772 59H776M782 59H786M1134 59H1138M1144 59H1148M1154 59H1158"
					stroke="#4ab6d6"
					stroke-opacity=".5"
					stroke-width="2"
				/>
				<path
					d="M772 59H776M1144 59H1148"
					stroke="#d2b84c"
					stroke-opacity=".8"
					stroke-width="2"
				/>
			</svg>
			<div class="blue-header-welcome">欢迎， 您的到来！</div>
			<h1 class="blue-header-title">可视化大屏</h1>
			<time class="blue-header-clock">{props.clock}</time>
			<For each={navigation}>
				{(nav) => (
					<nav
						class={`blue-header-nav blue-header-nav-${nav.side}`}
						aria-label={nav.side === "left" ? "左侧导航" : "右侧导航"}
					>
						<For each={nav.labels}>
							{(label, index) => (
								<button
									type="button"
									class="blue-header-menu"
									classList={{
										active: props.activeNav === index() + nav.offset,
									}}
									aria-pressed={props.activeNav === index() + nav.offset}
									onClick={() => props.onNavigate(index() + nav.offset)}
								>
									<svg
										viewBox="0 0 144 36"
										preserveAspectRatio="none"
										fill="none"
										aria-hidden="true"
									>
										<path
											class="blue-header-menu-base"
											d="M12 1H132L143 18L132 34H12L1 18Z"
											fill={`url(#${menuFill})`}
										/>
										<path
											class="blue-header-menu-lit"
											d="M12 1H132L143 18L132 34H12L1 18Z"
											fill={`url(#${menuActive})`}
										/>
										<path
											d="M12 1L1 18L12 34H132L143 18L132 1"
											stroke={`url(#${menuEdge})`}
											stroke-width="1.2"
										/>
										<path
											class="blue-header-menu-side"
											d="M8 6L0 18L8 30M136 6L144 18L136 30"
											stroke="#279dc5"
											stroke-opacity=".3"
										/>
										<path
											class="blue-header-menu-gold"
											d="M50 34H94"
											stroke="#f3c74d"
											stroke-width="2"
										/>
									</svg>
									<span>{label}</span>
								</button>
							)}
						</For>
					</nav>
				)}
			</For>
		</header>
	);
}

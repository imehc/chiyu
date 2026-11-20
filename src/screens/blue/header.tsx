/**
 * 大屏顶部导航条：绘制顶栏的渐变底板、双层发光描边、网格与电路纹理，
 * 并在其上叠加中央标题、左侧欢迎语、右侧时钟与左右两组梯形菜单按钮。
 * props 全部由上层大屏容器注入，组件自身不持有时钟计时器。
 */
import { createUniqueId, For } from "solid-js";
import BlueLineFlow from "./line-flow";
import "./header.css";

/**
 * 顶部导航条的外部入参。
 */
interface BlueHeaderProps {
	/** 已格式化好的时间文本，由上层定时器每秒刷新，本组件只负责展示 */
	clock: string;
	/** 当前激活项的全局索引（0~5），与 navigation 中的 offset 相加后比较 */
	activeNav: number;
	/** 点击导航项时回调，参数为换算后的全局索引 */
	onNavigate: (index: number) => void;
}

/**
 * 顶栏主轮廓折线，坐标系为 viewBox 0 0 1920 76（等比设计稿尺寸）。
 * 两侧走 y=18 的平直段，向中间分两级抬到 66 与 60，形成中央凸出的梯形台；
 * 此常量被「模糊底描边 + 细描边」两条 path 复用，保证两遍描边严格重合。
 */
const rim = "M0 18H688L735 66H919L929 60H991L1001 66H1185L1232 18H1920";
/**
 * 流光轨迹：左右各一条，都从端头沿轮廓爬升，并在 x=960 处汇合，
 * 使两条动画在同一锚点收束，视觉上像信号汇入中央金色装饰。
 */
const flowPaths = [
	"M0 18H688L735 66H919L929 60H960",
	"M1920 18H1232L1185 66H1001L991 60H960",
];
/**
 * 两组菜单配置。offset 把组内下标换算成全局下标（左组 0/1/2，右组 3/4/5），
 * 这样 activeNav 只需一个数字就能覆盖左右两栏，无需区分所在侧。
 */
const navigation = [
	{ side: "left", labels: ["经济概览", "一级按钮", "一级按钮"], offset: 0 },
	{ side: "right", labels: ["一级按钮", "一级按钮", "一级按钮"], offset: 3 },
];

/**
 * 顶栏组件本体。
 * 背景是一条 1920×76、preserveAspectRatio="none" 的 SVG，随容器横向拉伸铺满；
 * 文本与按钮则以绝对定位叠在 SVG 之上，避免字形跟着 SVG 一起被拉伸变形。
 */
export default function BlueHeader(props: BlueHeaderProps) {
	// 同一页面可能存在多个实例，defs 内的 id 必须唯一，否则渐变/滤镜会互相覆盖
	const id = createUniqueId();
	// 背景层：fill 为底板垂直渐变，edge 为轮廓横向高光，glow 为描边用的高斯模糊滤镜
	const fill = `blue-header-fill-${id}`;
	const edge = `blue-header-edge-${id}`;
	const glow = `blue-header-glow-${id}`;
	// 纹理层：grid 是横向十字网格，circuit 是折线电路纹理
	const grid = `blue-header-grid-${id}`;
	const circuit = `blue-header-circuit-${id}`;
	// 菜单层：menuFill 常态底色，menuActive 激活态底色，menuEdge 顶边高光
	const menuFill = `blue-header-menu-fill-${id}`;
	const menuActive = `blue-header-menu-active-${id}`;
	const menuEdge = `blue-header-menu-edge-${id}`;
	// 以下 JSX 的绘制顺序即成图顺序：底板 → 网格/电路纹理 → 内层暗线 → 双层发光描边
	// → 流光 → 中央金色装饰 → 底部短划线细节，后绘制的内容覆盖先绘制的内容。
	// edge 渐变在 37%/63% 处各放一个近白色 stop，对应轮廓两处转折的「金属反光」；
	// glow 滤镜区域写成 y=-100% height=300%，给 6px 描边的高斯模糊留出上下溢出空间，否则会被裁切。
	// grid 与 circuit 都用 userSpaceOnUse 平铺，88×32、26×9 的周期与设计稿网格对齐，缩放时不会随元素变形。
	// 菜单底形是「左右尖角 + 上下平边」的六边形（M12 1H132L143 18L132 34H12L1 18Z），
	// 宽 128 高 34 的按钮里塞 144×36 的 viewBox，留出的余量用来容纳描边和激活态的辉光。
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

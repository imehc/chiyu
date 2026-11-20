/**
 * 数据面板的 SVG 边框皮肤，由三层独立 SVG 叠放组成：
 * 主体底框（渐变填充 + 网格 + 切角描边）、顶部标题装饰条、以及只画一段短划的「巡边光束」。
 * 拆成三层是因为三者的拉伸比例不同（标题条高度固定），且巡边动画只应作用在最后一条路径上。
 * 尺寸基准为 396×230 的设计稿，配合 preserveAspectRatio="none" 跟随面板实际大小变形。
 */
import { createUniqueId } from "solid-js";

/**
 * 面板主轮廓：396×230 的矩形，四个角各切掉 13px 斜角（M13 1 → L395 13 → L383 229 → L1 217）。
 * 填充、网格铺底、描边、巡边四条路径共用同一个 d，保证任何一处描边都与填充严丝合缝。
 */
const outline = "M13 1H383L395 13V217L383 229H13L1 217V13Z";

/**
 * 面板边框组件，无 props，纯装饰（各 SVG 均 aria-hidden）。
 */
export default function BluePanelFrame() {
	// 同一页面会渲染多个面板，defs 的 id 必须逐实例唯一，否则后渲染的会覆盖前者的渐变与图案
	const id = createUniqueId();
	const fill = `blue-panel-fill-${id}`;
	const edge = `blue-panel-edge-${id}`;
	const title = `blue-panel-title-fill-${id}`;
	const grid = `blue-panel-grid-${id}`;
	// 三块 SVG 的叠放顺序：底框在最下，标题条叠在面板顶部（viewBox 396×33），
	// 巡边层最上且 overflow 可见，让短划能贴着轮廓走而不被 viewBox 裁掉。
	// 底框内部再分：填充 → 网格 → 主描边 → 内侧细线 → 亮角 → 底部短线。
	// 巡边层用 pathLength="100" 把周长归一化，dasharray "7 93" 因此恒表示「亮段占周长 7%」，
	// 与面板实际像素尺寸无关；位移由 panels.css 的 blue-panel-border-flow 关键帧驱动。
	return (
		<>
			<svg
				class="blue-panel-frame"
				viewBox="0 0 396 230"
				preserveAspectRatio="none"
				fill="none"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
						<stop stop-color="#092e4b" stop-opacity=".74" />
						<stop offset=".48" stop-color="#04182d" stop-opacity=".8" />
						<stop offset="1" stop-color="#07304c" stop-opacity=".62" />
					</linearGradient>
					<linearGradient id={edge} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#398cb4" stop-opacity=".58" />
						<stop offset=".2" stop-color="#185276" stop-opacity=".32" />
						<stop offset=".7" stop-color="#185276" stop-opacity=".26" />
						<stop offset="1" stop-color="#2384a8" stop-opacity=".52" />
					</linearGradient>
					<linearGradient id={title} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#0a3151" stop-opacity=".72" />
						<stop offset="1" stop-color="#125682" stop-opacity=".5" />
					</linearGradient>
					<pattern
						id={grid}
						width="44"
						height="32"
						patternUnits="userSpaceOnUse"
					>
						<path d="M44 0H0V32" stroke="#3c93b6" stroke-opacity=".035" />
						<path
							d="M21 16H25M23 14V18"
							stroke="#64b6d6"
							stroke-opacity=".055"
						/>
					</pattern>
				</defs>
				<path class="blue-panel-base" d={outline} fill={`url(#${fill})`} />
				<path d={outline} fill={`url(#${grid})`} />
				<path class="blue-panel-edge" d={outline} stroke={`url(#${edge})`} />
				<path
					d="M15 5H380L391 16V214L379 225H16L5 214V16Z"
					stroke="#1d5273"
					stroke-opacity=".19"
				/>
				<path
					d="M1 49V13L13 1H57M339 229H383L395 217V190"
					stroke="#37b7d4"
					stroke-opacity=".35"
				/>
				<path
					d="M24 225H71M325 225H372"
					stroke="#227095"
					stroke-opacity=".35"
				/>
			</svg>
			<svg
				class="blue-panel-title-art"
				viewBox="0 0 396 33"
				preserveAspectRatio="none"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M13 1H229L243 14H382L395 27V32H1V13Z"
					fill={`url(#${title})`}
				/>
				<path
					d="M13 2H228L242 15H381L392 26"
					stroke="#2f97bd"
					stroke-opacity=".42"
				/>
				<path d="M1 32H164L173 27H395" stroke="#2584b0" stroke-opacity=".45" />
				<path
					d="M28 31H64"
					stroke="#dfb951"
					stroke-width="1.5"
					stroke-opacity=".85"
				/>
				<path
					d="M261 20H267M274 20H280M287 20H293"
					stroke="#4b99bc"
					stroke-opacity=".3"
					stroke-width="1.5"
				/>
			</svg>
			<svg
				class="blue-panel-flow-frame"
				viewBox="0 0 396 230"
				preserveAspectRatio="none"
				fill="none"
				aria-hidden="true"
			>
				<path
					class="blue-panel-beam"
					d={outline}
					pathLength="100"
					stroke="#69dafa"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-dasharray="7 93"
				/>
			</svg>
		</>
	);
}

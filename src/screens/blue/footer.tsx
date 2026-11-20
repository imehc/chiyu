import { createUniqueId } from "solid-js";
import BlueLineFlow from "./line-flow";
import "./footer.css";

const rim = "M0 40H610L648 4H1272L1310 40H1920";
const flowPaths = ["M0 40H610L648 4H960", "M1920 40H1310L1272 4H960"];

export default function BlueFooter() {
	const id = createUniqueId();
	const fill = `blue-footer-fill-${id}`;
	const edge = `blue-footer-edge-${id}`;
	const glow = `blue-footer-glow-${id}`;
	const grid = `blue-footer-grid-${id}`;
	const circuit = `blue-footer-circuit-${id}`;
	return (
		<div class="blue-command-footer" aria-hidden="true">
			<svg
				class="blue-footer-art"
				aria-hidden="true"
				viewBox="0 0 1920 62"
				preserveAspectRatio="none"
				fill="none"
			>
				<defs>
					<linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
						<stop stop-color="#0b4268" stop-opacity=".78" />
						<stop offset=".45" stop-color="#072642" stop-opacity=".88" />
						<stop offset="1" stop-color="#031122" stop-opacity=".98" />
					</linearGradient>
					<linearGradient id={edge} x1="0" y1="0" x2="1" y2="0">
						<stop stop-color="#125d87" stop-opacity=".35" />
						<stop offset=".27" stop-color="#238abd" stop-opacity=".65" />
						<stop offset=".34" stop-color="#27e5f5" />
						<stop offset=".4" stop-color="#329dce" />
						<stop offset=".5" stop-color="#3aa0d5" stop-opacity=".68" />
						<stop offset=".6" stop-color="#329dce" />
						<stop offset=".66" stop-color="#27e5f5" />
						<stop offset=".73" stop-color="#238abd" stop-opacity=".65" />
						<stop offset="1" stop-color="#125d87" stop-opacity=".35" />
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
						<path d="M88 0H0V32" stroke="#6dceff" stroke-opacity=".065" />
						<path d="M40 16H48M44 12V20" stroke="#6dceff" stroke-opacity=".1" />
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
					d="M0 40H610L648 4H1272L1310 40H1920V62H0Z"
					fill={`url(#${fill})`}
				/>
				<path d="M650 8H1270V60H650Z" fill={`url(#${grid})`} />
				<path
					d="M8 49H590V58H8ZM1330 49H1912V58H1330Z"
					fill={`url(#${circuit})`}
				/>
				<path
					d="M0 36H608L646 0H1274L1312 36H1920"
					stroke="#13577d"
					stroke-opacity=".35"
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
					d="M0 47H613L651 11H1269L1307 47H1920"
					stroke="#1c6892"
					stroke-opacity=".28"
				/>
				<BlueLineFlow paths={flowPaths} begin="-4.2s" />
				<path
					d="M650 53H918L927 58H993L1002 53H1270"
					stroke="#1c749c"
					stroke-opacity=".5"
				/>
				<path
					d="M688 50H772M1148 50H1232"
					stroke="#2084ad"
					stroke-opacity=".4"
				/>
				<path
					d="M690 20H694M700 20H704M710 20H714M1206 20H1210M1216 20H1220M1226 20H1230"
					stroke="#4ab6d6"
					stroke-opacity=".5"
					stroke-width="2"
				/>
				<path
					d="M700 20H704M1216 20H1220"
					stroke="#d2b84c"
					stroke-opacity=".8"
					stroke-width="2"
				/>
				<path
					class="blue-footer-gold-glow"
					d="M927 57H993"
					stroke="#f9cb4c"
					stroke-width="4"
					filter={`url(#${glow})`}
				/>
				<path d="M922 59L927 56H993L998 59Z" fill="#f6c44b" />
			</svg>
		</div>
	);
}

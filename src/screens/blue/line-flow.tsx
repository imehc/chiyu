/**
 * SVG 流光：让一段带彗尾的光点沿给定路径循环飞行，用于顶栏、底栏与边框的「信号流动」效果。
 * 纯 SMIL（animate / animateMotion）实现，不依赖 CSS 动画或 JS 逐帧计算，
 * 因此可以被任意 SVG 父元素包裹而无需测量尺寸；顶栏与底栏通过 begin 偏移错开节奏。
 */
import { createUniqueId, For } from "solid-js";

/**
 * 彗尾采样表，预生成 20 个沿路径排布的「点」。
 * distance 表示该点落后头部多少个步距（0 即头部），strength 随 distance 线性衰减；
 * 宽度按 strength² 收敛、透明度按 strength^1.6 衰减，于是头部又粗又亮、越往尾部越细越淡。
 * offset 的间隔 0.011 是在归一化路径长度（pathLength=1）下的经验值，
 * 与 stroke-dasharray 的短划长度 0.0115 接近，保证尾部点之间刚好留出缝隙而不粘连。
 */
const trail = Array.from({ length: 20 }, (_, i) => {
	const distance = 19 - i;
	const strength = 1 - distance / 20;
	return {
		offset: 0.0115 + distance * 0.011,
		width: 0.75 + 4.8 * strength ** 2,
		opacity: 0.85 * strength ** 1.6,
	};
});

/**
 * 流光组件。
 * @param props.paths 若干条路径的 d 属性，每条路径各自生成一套独立动画
 * @param props.begin SMIL begin 值（如 "-1.4s"），省略时从 0s 开始
 */
export default function BlueLineFlow(props: {
	paths: readonly string[];
	begin?: string;
}) {
	// 渐变与滤镜 id 逐实例唯一化，避免同页多个流光共用 defs 时互相覆盖
	const id = createUniqueId();
	const gradientId = `blue-line-droplet-${id}`;
	const glowId = `blue-line-glow-${id}`;
	// 动画时间线（周期 5.6s，无限循环）由三部分配合：
	// ① 整组 opacity：0~6% 保持透明、6%~10% 淡入，79%~86% 淡出，避免光点在路径端点突然出现/消失；
	// ② 拖尾 stroke-dashoffset：6%~80% 从 offset 线性走到 offset-1，
	//    因为 pathLength="1"，减 1 正好等于沿路径前进一整圈；
	// ③ animateMotion：keyPoints 0;0;1;1;1 让光点在 6% 前停在起点、80% 后停在终点，
	//    与拖尾的位移区间对齐；rotate="auto" 使彗星朝向自动贴合路径切线。
	// 彗星本体用局部坐标绘制（x 负方向为尾），靠 animateMotion 整体搬运，故无需路径偏移换算。
	// 头部渐变采用 userSpaceOnUse 并沿局部 x 轴从 -20 铺到 5：尾端全透明，靠近头部升到近白色；
	// 外层 ellipse 再叠一层高斯模糊充当光晕，filter 区域放宽到横向 -100%~200%、纵向 -200%~300%，避免被滤镜框裁切。
	// 元素初始 opacity="0" 是给不支持 SMIL 的环境兜底，动画启动后由 animate 接管该属性。
	return (
		<g>
			<defs>
				<linearGradient
					id={gradientId}
					x1="-20"
					y1="0"
					x2="5"
					y2="0"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#18a8ff" stop-opacity="0" />
					<stop offset=".4" stop-color="#23cfff" stop-opacity=".2" />
					<stop offset=".8" stop-color="#71f3ff" stop-opacity=".85" />
					<stop offset="1" stop-color="#edffff" />
				</linearGradient>
				<filter id={glowId} x="-100%" y="-200%" width="300%" height="500%">
					<feGaussianBlur stdDeviation="3" />
				</filter>
			</defs>
			<For each={props.paths}>
				{(path) => (
					<g class="blue-line-flow" opacity="0">
						<animate
							attributeName="opacity"
							values="0;0;1;1;0;0"
							keyTimes="0;.06;.1;.79;.86;1"
							begin={props.begin ?? "0s"}
							dur="5.6s"
							repeatCount="indefinite"
						/>
						<g class="blue-line-trail">
							<For each={trail}>
								{(segment) => (
									<path
										d={path}
										pathLength="1"
										fill="none"
										stroke="#5be8ff"
										stroke-width={segment.width}
										stroke-dasharray="0.0115 2"
										stroke-dashoffset={segment.offset}
										opacity={segment.opacity}
									>
										<animate
											attributeName="stroke-dashoffset"
											values={`${segment.offset};${segment.offset};${segment.offset - 1};${segment.offset - 1}`}
											keyTimes="0;.06;.8;1"
											begin={props.begin ?? "0s"}
											dur="5.6s"
											repeatCount="indefinite"
										/>
									</path>
								)}
							</For>
						</g>
						<g>
							<animateMotion
								path={path}
								rotate="auto"
								begin={props.begin ?? "0s"}
								dur="5.6s"
								keyPoints="0;0;1;1;1"
								keyTimes="0;.06;.8;.86;1"
								calcMode="linear"
								repeatCount="indefinite"
							/>
							<ellipse
								cx="-7"
								rx="18"
								ry="7"
								fill="#32d9ff"
								opacity=".8"
								filter={`url(#${glowId})`}
							/>
							<path
								d="M-20 0C-13-.4-9-2.5-6-3.8C-1-6 4-3.7 5 0C4 3.7-1 6-6 3.8C-9 2.5-13 .4-20 0Z"
								fill={`url(#${gradientId})`}
							/>
							<ellipse cx="0" rx="3.5" ry="2" fill="#edffff" />
						</g>
					</g>
				)}
			</For>
		</g>
	);
}

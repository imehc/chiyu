import { createUniqueId, For } from "solid-js";

const trail = Array.from({ length: 20 }, (_, i) => {
	const distance = 19 - i;
	const strength = 1 - distance / 20;
	return {
		offset: 0.0115 + distance * 0.011,
		width: 0.75 + 4.8 * strength ** 2,
		opacity: 0.85 * strength ** 1.6,
	};
});

export default function BlueLineFlow(props: {
	paths: readonly string[];
	begin?: string;
}) {
	const id = createUniqueId();
	const gradientId = `blue-line-droplet-${id}`;
	const glowId = `blue-line-glow-${id}`;
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

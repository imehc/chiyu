import { createUniqueId } from "solid-js";

/** Decorative light bars shared by the map controls. */
export function BlueControlFrame(props: { marker?: boolean }) {
	const id = createUniqueId();
	const fillId = `blue-control-fill-${id}`;
	const edgeId = `blue-control-edge-${id}`;
	return (
		<svg
			class="blue-control-frame"
			viewBox="0 0 120 36"
			preserveAspectRatio="none"
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id={fillId} x1="0" y1="0" x2="1" y2="0">
					<stop stop-color="#0b2746" stop-opacity="0" />
					<stop offset=".25" stop-color="#12527d" stop-opacity=".65" />
					<stop offset=".65" stop-color="#146899" stop-opacity=".72" />
					<stop offset="1" stop-color="#0b2746" stop-opacity="0" />
				</linearGradient>
				<linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="0">
					<stop stop-color="#2384c0" stop-opacity="0" />
					<stop offset=".28" stop-color="#389ddc" stop-opacity=".7" />
					<stop offset=".55" stop-color="#81e5ff" />
					<stop offset=".78" stop-color="#329bd6" stop-opacity=".65" />
					<stop offset="1" stop-color="#2384c0" stop-opacity="0" />
				</linearGradient>
			</defs>
			<path
				class="blue-control-plate"
				d="M0 2H120V34H0Z"
				fill={`url(#${fillId})`}
			/>
			<path
				class="blue-control-edge"
				d="M2 2H118M2 34H118"
				stroke={`url(#${edgeId})`}
				stroke-width="1"
			/>
			<path
				class="blue-control-light"
				d="M2 2H118M2 34H118"
				stroke={`url(#${edgeId})`}
				stroke-width="2"
			/>
			{props.marker && (
				<path
					class="blue-control-marker"
					d="M12 13L18 18L12 23Z"
					fill="#b5edff"
				/>
			)}
		</svg>
	);
}

/** Bevelled, double-edged frame for map layers and footer selectors. */
export function BlueTabFrame() {
	const id = createUniqueId();
	const fillId = `blue-tab-fill-${id}`;
	const edgeId = `blue-tab-edge-${id}`;
	const goldId = `blue-tab-gold-${id}`;
	return (
		<svg
			class="blue-tab-frame"
			viewBox="0 0 160 44"
			preserveAspectRatio="none"
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
					<stop stop-color="#092039" stop-opacity=".2" />
					<stop offset=".45" stop-color="#0b365d" stop-opacity=".82" />
					<stop offset="1" stop-color="#167db8" />
				</linearGradient>
				<linearGradient id={edgeId} x1="0" y1="0" x2="0" y2="1">
					<stop stop-color="#16466a" stop-opacity=".3" />
					<stop offset=".5" stop-color="#2c7db0" stop-opacity=".7" />
					<stop offset="1" stop-color="#4ebde7" />
				</linearGradient>
				<linearGradient id={goldId} x1="0" y1="0" x2="0" y2="1">
					<stop stop-color="#fff1a2" />
					<stop offset="1" stop-color="#e2ac37" />
				</linearGradient>
			</defs>
			<path
				class="blue-tab-face"
				d="M14 2H146L157 22L146 40H14L3 22Z"
				fill={`url(#${fillId})`}
			/>
			<path
				class="blue-tab-edge"
				d="M14 2H146L157 22L146 40H14L3 22Z"
				stroke={`url(#${edgeId})`}
				stroke-width="1.4"
			/>
			<path
				class="blue-tab-outer-edge"
				d="M9 4L0 22L10 42M151 4L160 22L150 42"
				stroke={`url(#${edgeId})`}
				stroke-width="1"
			/>
			<path
				class="blue-tab-light"
				d="M14 40H146"
				stroke="#58d1ff"
				stroke-width="1.5"
			/>
			<path
				class="blue-tab-active-mark"
				d="M57 40H103L105 43H55Z"
				fill={`url(#${goldId})`}
			/>
		</svg>
	);
}

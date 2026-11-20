/**
 * 控件用的小尺寸 SVG 边框：给地图图层按钮、工具按钮与视图页签提供统一的科技感外框。
 * 只负责画形状，状态的明暗完全交给 controls.css 按 class 切换透明度，
 * 因此这里的路径不带任何 fill-opacity / stroke-opacity，避免与样式表打架。
 */
import { createUniqueId } from "solid-js";

/**
 * 横向光条边框：上下两条水平线 + 中间淡淡的渐变底板，用于「图层 / 工具」这类窄条按钮。
 * @param props.marker 是否在左侧绘制三角指示器，仅当前可用的工具按钮需要
 */
export function BlueControlFrame(props: { marker?: boolean }) {
	// 每条渐变要在同页多个按钮间保持独立，故 id 逐实例唯一
	const id = createUniqueId();
	const fillId = `blue-control-fill-${id}`;
	const edgeId = `blue-control-edge-${id}`;
	// 所有图元都画在 120×36 的坐标系里：底板是 2~34 的矩形，
	// 上下描边各一条（y=2 / y=34），light 与 edge 共用同一段 d，只是线宽不同，
	// 这样悬停时把 light 的透明度提上来就等于在原描边上叠一层辉光。
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

/**
 * 斜切双层边框：六边形主面板（左右尖角）+ 外侧再张一层折线描边，
 * 用于地图图层按钮、视图页签与底部货运方式选择器。
 */
export function BlueTabFrame() {
	// 面、边、金条三组渐变分别跟随各自的 class，便于样式表独立控制激活态
	const id = createUniqueId();
	const fillId = `blue-tab-fill-${id}`;
	const edgeId = `blue-tab-edge-${id}`;
	const goldId = `blue-tab-gold-${id}`;
	// 160×44 坐标系：主面 M14 2H146L157 22L146 40H14L3 22Z 是左右顶到 3/157 的六边形，
	// outer-edge 在两侧各再向外 9px 折一道，形成「双层切角」的层次；
	// 底部横线（y=40）与金色梯形（active-mark）只在悬停/选中时由样式表点亮。
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

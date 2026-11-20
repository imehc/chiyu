/**
 * 面板外壳：标题栏 + 内容槽的固定骨架。
 * 被同目录 index.tsx 反复包裹各类图表与列表，
 * 边框与流光 SVG 来自 ../panel-frame，样式在 ../panels.css 的 .blue-panel 一系；
 * 标题「一级小标题」目前是占位文案，内容完全由 children 注入。
 */
import type { JSX } from "solid-js";
import BluePanelFrame from "../panel-frame";

/**
 * 一块带装饰边框的面板。
 * @param props.side 传 "right" 时追加 blue-panel-right 类，CSS 会把边框、标题排布与装饰点整体水平镜像
 * @param props.children 面板内容，渲染在标题栏（33px）以下、左右内缩 8px、底部内缩 5px 的绝对定位区域中
 * 组件没有内部状态，side 变化仅改变 class 组合，不重建 DOM。
 */
export default function Panel(props: {
	side?: "left" | "right";
	children: JSX.Element;
}) {
	// 左右两列复用同一套 SVG 边框，靠 CSS 的 scaleX(-1) 做镜像，避免维护两份对称图形
	return (
		<section
			class={`blue-panel ${props.side === "right" ? "blue-panel-right" : ""}`}
		>
			<BluePanelFrame />
			<div class="blue-panel-title">
				<i class="blue-panel-status" aria-hidden="true" />
				<span>一级小标题</span>
				<i class="blue-title-dots" aria-hidden="true">
					<span />
					<span />
					<span />
				</i>
			</div>
			<div class="blue-panel-content">{props.children}</div>
		</section>
	);
}

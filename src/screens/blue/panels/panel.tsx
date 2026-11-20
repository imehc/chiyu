import type { JSX } from "solid-js";
import BluePanelFrame from "../panel-frame";

export default function Panel(props: {
	side?: "left" | "right";
	children: JSX.Element;
}) {
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

import { For } from "solid-js";
import ChartPanel from "./chart-panel";
import { chinaLeftPanels, chinaRightPanels } from "./options";

export function ChinaLeftPanels() {
	return (
		<For each={chinaLeftPanels}>
			{(panel) => (
				<ChartPanel title={panel.title} option={panel.option} side="left" />
			)}
		</For>
	);
}

export function ChinaRightPanels() {
	return (
		<For each={chinaRightPanels}>
			{(panel) => (
				<ChartPanel title={panel.title} option={panel.option} side="right" />
			)}
		</For>
	);
}

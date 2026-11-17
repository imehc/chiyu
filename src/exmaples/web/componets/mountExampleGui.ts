import type { GUI } from "dat.gui";
import styles from "./Container.module.css";

/** Mount an imperative GUI below its scene; the scene ref keeps its original size. */
export function mountExampleGui(gui: GUI, scene: HTMLElement): GUI {
	const root = scene.closest("[data-example-root]");
	const host = root?.querySelector<HTMLElement>(
		":scope > [data-example-controls]",
	);
	if (!host) throw new Error("Example controls require a Container.");

	const panel = document.createElement("details");
	panel.className = styles.panel;
	panel.open = window.matchMedia("(min-width: 768px)").matches;
	const summary = document.createElement("summary");
	summary.textContent = "操作面板";
	panel.append(summary, gui.domElement);
	host.append(panel);
	const resizeObserver = new ResizeObserver(([entry]) => {
		const width = Math.floor(entry.contentRect.width);
		if (width > 0 && gui.width !== width) gui.width = width;
	});
	resizeObserver.observe(panel);

	// dat.gui uses non-focusable rows for action controls. Enable keyboard activation.
	const enhanceActions = () => {
		for (const row of gui.domElement.querySelectorAll<HTMLElement>(
			".cr.function",
		)) {
			if (row.hasAttribute("role")) continue;
			row.setAttribute("role", "button");
			row.tabIndex = 0;
			row.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					row.click();
				}
			});
		}
	};
	const observer = new MutationObserver(enhanceActions);
	observer.observe(gui.domElement, { childList: true, subtree: true });
	enhanceActions();

	const destroy = gui.destroy.bind(gui);
	let destroyed = false;
	gui.destroy = () => {
		if (destroyed) return;
		destroyed = true;
		resizeObserver.disconnect();
		observer.disconnect();
		destroy();
		panel.remove();
	};
	return gui;
}

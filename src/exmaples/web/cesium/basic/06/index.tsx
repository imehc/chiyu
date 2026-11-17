import type { Viewer } from "cesium";
import type { GUI } from "dat.gui";
import { useEffect, useRef } from "react";
import Container from "../../../componets/Container";

export default function App() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = ref.current;
		if (!container) return;

		let disposed = false;
		let viewer: Viewer;
		let gui: GUI;

		// Dynamic import to ensure Cesium is only loaded on the client side
		import("./viewer")
			.then(({ initViewer }) => {
				if (disposed) return;
				const result = initViewer(container);
				viewer = result.viewer;
				gui = result.gui;
			})
			.catch((error) => {
				if (!disposed) console.error("场景加载失败:", error);
			});

		return () => {
			disposed = true;
			if (viewer && !viewer.isDestroyed()) {
				viewer.destroy();
			}
			if (gui) {
				gui.destroy();
			}
		};
	}, []);

	return (
		<Container>
			<div className="tw:size-full" ref={ref} />
		</Container>
	);
}

import type { Viewer } from "cesium";
import { useEffect, useRef } from "react";
import Container from "../../../componets/Container";
import type PointCluster from "./point-cluster";

export default function App() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = ref.current;
		if (!container) return;

		let disposed = false;
		let viewer: Viewer;
		let cluster: PointCluster;

		// Dynamic import to ensure Cesium is only loaded on the client side
		import("./viewer")
			.then(({ initViewer }) => {
				if (disposed) return;
				const result = initViewer(container);
				viewer = result.viewer;
				cluster = result.cluster;
			})
			.catch((error) => {
				if (!disposed) console.error("场景加载失败:", error);
			});

		return () => {
			disposed = true;
			if (viewer && !viewer.isDestroyed()) {
				viewer.destroy();
			}
			if (cluster) {
				cluster.remove();
			}
		};
	}, []);

	return (
		<Container>
			<div className="tw:size-full" ref={ref} />
		</Container>
	);
}

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { mountExampleGui } from "@site/src/exmaples/web/componets/mountExampleGui";
import type { GUI } from "dat.gui";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Container from "../../../componets/Container";
import LoadingNormal from "../../../componets/Loading";
import {
	currentComponent,
	type GlobeCompKey,
	transformGuiParam,
} from "./constant";

const DEFAULT_EXAMPLE: GlobeCompKey = "03";

export default function Viewer() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentExample, setCurrentExample] =
		useState<GlobeCompKey>(DEFAULT_EXAMPLE);

	useEffect(() => {
		let disposed = false;
		let gui: GUI | undefined;
		// 动态导入 dat.gui 以支持 SSR
		import("dat.gui").then(({ GUI }) => {
			if (disposed || !containerRef.current) return;
			gui = mountExampleGui(
				new GUI({ autoPlace: false }),
				containerRef.current,
			);

			// GUI控制参数对象
			const params = {
				example: DEFAULT_EXAMPLE,
			};

			// 添加下拉选择器
			gui
				.add(params, "example", transformGuiParam())
				.name("切换示例")
				.onChange(setCurrentExample);
		});

		return () => {
			disposed = true;
			gui?.destroy();
		};
	}, []);

	// 动态获取组件
	const ExampleComponent = useMemo(() => {
		return currentComponent(currentExample);
	}, [currentExample]);

	if (!ExampleComponent) return <Container ref={containerRef} />;

	// 独立场景，不需要 Canvas
	if (Object.values(transformGuiParam("detachment")).includes(currentExample)) {
		return (
			<Container ref={containerRef}>
				<Suspense fallback={<LoadingNormal />}>
					<ExampleComponent />
				</Suspense>
			</Container>
		);
	}

	return (
		<Container ref={containerRef}>
			<Canvas camera={{ position: [0, 0, 300], fov: 75 }}>
				<ambientLight intensity={5} />
				<OrbitControls makeDefault />
				{/* Avoid Html portal roots in the scene loading boundary: switching renderers can detach their DOM before cleanup. */}
				<Suspense fallback={null}>
					<ExampleComponent />
				</Suspense>
			</Canvas>
		</Container>
	);
}

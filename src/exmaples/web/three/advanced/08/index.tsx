import { Canvas } from "@react-three/fiber";
import Stats from "@site/src/exmaples/web/componets/ExampleStats";
import { useRef } from "react";
import type { GridHelper } from "three";
import Container from "../../../componets/Container";
import { Ball } from "./Ball";

/**
 * 无限滚动
 */
const Demo2v08 = () => {
	const ref = useRef<GridHelper>(null);
	return (
		<Container>
			<Canvas
				camera={{ position: [0, 2.5, 2.5] }}
				onCreated={({ camera }) => camera.lookAt(0, 1, 0)}
			>
				<gridHelper ref={ref} args={[100, 100]} />
				<Ball floor={ref} />
				<Stats />
			</Canvas>
			{/* <Overlay /> */}
		</Container>
	);
};

export default Demo2v08;

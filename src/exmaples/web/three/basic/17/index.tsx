import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import Stats from "@site/src/exmaples/web/componets/ExampleStats";
import { asset } from "@site/src/utils/asset";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import Container from "../../../componets/Container";

/**
 * 环境
 */
const Demo17: React.FC = () => {
	const gltf = useLoader(GLTFLoader, asset("/models/monkey.glb"));

	return (
		<Container>
			<Canvas camera={{ position: [-0.5, 1, 2] }}>
				{/* 预设 */}
				{/* <Environment preset="city" background /> */}
				<Environment
					// files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/meadow_2_1k.hdr"
					files={asset("/imgs/venice_sunset_1k.hdr")}
					background
					// 模糊背景
					// blur={0.5}
				/>
				<directionalLight position={[3.3, 1.0, 4.4]} intensity={4} />
				<primitive object={gltf.scene} position={[0, 1, 0]} />
				<OrbitControls target={[0, 1, 0]} autoRotate />
				<axesHelper args={[5]} />
				<Stats />
			</Canvas>
		</Container>
	);
};

export default Demo17;

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Stats from "@site/src/exmaples/web/componets/ExampleStats";
import { Leva } from "leva";
import Container from "../../../componets/Container";
import { Env } from "./Env";
import { Model } from "./Model";

/**
 * GLTF场景
 */
const Demo18: React.FC = () => {
	return (
		<Container controls={<Leva fill titleBar={false} hideCopyButton />}>
			<Canvas camera={{ position: [-8, 5, 8] }}>
				<Env />
				<Model />
				<ContactShadows
					scale={150}
					position={[0.33, -0.33, 0.33]}
					opacity={1.5}
				/>
				<OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2} />
				<Stats />
			</Canvas>
		</Container>
	);
};

export default Demo18;

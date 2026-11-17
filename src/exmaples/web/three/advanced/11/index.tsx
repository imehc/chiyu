import { Bounds, Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Stats from "@site/src/exmaples/web/componets/ExampleStats";
import { Leva } from "leva";
import Container from "../../../componets/Container";
import { Squircle } from "./Squircle";

/**
 * Squircle
 */
export const Demo2v11 = () => {
	return (
		<Container controls={<Leva fill titleBar={false} hideCopyButton />}>
			<Canvas camera={{ position: [0, 2, -1.5] }}>
				<Environment files="/imgs/rustig_koppie_puresky_1k.hdr" background />
				<Bounds fit margin={1.8} /** damping={10} */>
					<Squircle />
				</Bounds>
				<OrbitControls target={[0, 1, 0]} autoRotate />
				<Stats />
			</Canvas>
		</Container>
	);
};

export default Demo2v11;

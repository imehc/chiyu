import { PointerLockControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Stats from "@site/src/exmaples/web/componets/ExampleStats";
import { useEffect, useId, useState } from "react";
import "./index.css";
import Container from "../../../componets/Container";

/**
 * 第一人称轨道控制
 */
const Demo09: React.FC = () => {
	const [showInstructions, setShowInstructions] = useState(true);
	const instructionsId = useId();
	const buttonId = useId();

	useEffect(() => {
		const pointerlockchange = () => {
			setShowInstructions((showInstructions) => !showInstructions);
		};

		document.addEventListener("pointerlockchange", pointerlockchange, false);
		return () => {
			document.removeEventListener(
				"pointerlockchange",
				pointerlockchange,
				false,
			);
		};
	}, []);

	return (
		<Container>
			<Canvas>
				<mesh>
					<boxGeometry args={[100, 10, 100, 100, 10, 100]} />
					<meshBasicMaterial wireframe color={"lime"} />
				</mesh>
				<PointerLockControls selector={`#${buttonId}`} />
				<Stats />
			</Canvas>
			<div id={instructionsId} className={showInstructions ? "show" : "hide"}>
				Instructions
				<button id={buttonId} type="button">
					Click To Enter
				</button>
			</div>
		</Container>
	);
};

export default Demo09;

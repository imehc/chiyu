import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import Stats from "@site/src/exmaples/web/componets/ExampleStats";
import { Group } from "@tweenjs/tween.js";
import { type ComponentRef, Suspense, useRef, useState } from "react";
import Container from "../../../componets/Container";
import { Annotations } from "./Annotations";
import { House } from "./House";
import { Loader } from "./Loader";

// Create a shared TWEEN group for this demo
export const tweenGroup = new Group();

const Tween = () => {
	useFrame(() => {
		tweenGroup.update();
	});

	return null;
};

/**
 * 房子
 */
const Demo2v01: React.FC = () => {
	const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
	// Keep Html's mount target stable while Canvas initializes and pages change.
	const [annotationPortal, setAnnotationPortal] =
		useState<HTMLDivElement | null>(null);
	const position = [8, 2, 3] as [number, number, number];

	return (
		<Container>
			<div
				ref={setAnnotationPortal}
				className="tw:absolute tw:inset-0 tw:pointer-events-none"
			/>
			<Canvas camera={{ position: [8, 2, 12] }}>
				<OrbitControls ref={ref} target={position} />
				<Suspense fallback={null}>
					<Environment preset="forest" background blur={0.75} />
					<House />
					{annotationPortal && (
						<Annotations
							controls={ref}
							portal={{ current: annotationPortal }}
						/>
					)}
					<Tween />
				</Suspense>
				<Stats />
			</Canvas>
			<Loader />
		</Container>
	);
};

export default Demo2v01;

import { Select } from "@react-three/postprocessing";
import type React from "react";
import { useState } from "react";
import type { BufferGeometry, Material } from "three";
import { useStore } from "./use_store";

interface Props {
	geometry: BufferGeometry;
	material: Material | Material[];
	position: [number, number, number];
}

export const Selectable: React.FC<Props> = ({
	geometry,
	material,
	position,
}) => {
	const [hovered, hover] = useState(false);
	const { setOrbitmode, setAutoRotate, to } = useStore((state) => state);

	return (
		<Select enabled={hovered}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: Three.js mesh receives raycast events rather than DOM interactions. */}
			<mesh
				onPointerOver={(e) => {
					e.stopPropagation();
					hover(true);
				}}
				onPointerOut={() => hover(false)}
				onClick={(e) => {
					e.stopPropagation();
					to.set(...position);
					setOrbitmode(true);
					setTimeout(() => setAutoRotate(true), 1000);
				}}
				geometry={geometry}
				material={material}
				position={position}
			/>
		</Select>
	);
};

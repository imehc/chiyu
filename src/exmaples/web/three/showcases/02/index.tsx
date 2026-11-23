import {
	Environment,
	Lightformer,
	useGLTF,
	useTexture,
} from "@react-three/drei";
import {
	Canvas,
	extend,
	type ThreeElement,
	useFrame,
	useThree,
} from "@react-three/fiber";
import {
	BallCollider,
	CuboidCollider,
	Physics,
	type RapierRigidBody,
	RigidBody,
	type RigidBodyOptions,
	useRopeJoint,
	useSphericalJoint,
} from "@react-three/rapier";
import { asset } from "@site/src/utils/asset";
import { Leva, useControls } from "leva";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
	CatmullRomCurve3,
	type Mesh,
	type MeshPhysicalMaterial,
	RepeatWrapping,
	Vector2,
	Vector3,
} from "three";
import Container from "../../../componets/Container";

extend({ MeshLineGeometry, MeshLineMaterial });
useGLTF.preload(asset("/card/tag.glb"));
useTexture.preload(asset("/card/band.jpeg"));

declare module "@react-three/fiber" {
	interface ThreeElements {
		meshLineGeometry: ThreeElement<typeof MeshLineGeometry>;
		meshLineMaterial: ThreeElement<typeof MeshLineMaterial>;
	}
}

/**
 * @see https://vercel.com/blog/building-an-interactive-3d-event-badge-with-react-three-fiber
 */
export const Demo0302 = () => {
	const { debug } = useControls({ debug: false });
	return (
		<Container controls={<Leva fill titleBar={false} hideCopyButton />}>
			<Canvas camera={{ position: [0, 0, 13], fov: 25 }}>
				<ambientLight intensity={Math.PI} />
				<Physics
					debug={debug}
					interpolate
					gravity={[0, -40, 0]}
					timeStep={1 / 60}
				>
					<Band />
				</Physics>
				<Environment background blur={0.75}>
					<color attach="background" args={["black"]} />
					<Lightformer
						intensity={2}
						color="white"
						position={[0, -1, 5]}
						rotation={[0, 0, Math.PI / 3]}
						scale={[100, 0.1, 1]}
					/>
					<Lightformer
						intensity={3}
						color="white"
						position={[-1, -1, 1]}
						rotation={[0, 0, Math.PI / 3]}
						scale={[100, 0.1, 1]}
					/>
					<Lightformer
						intensity={3}
						color="white"
						position={[1, 1, 1]}
						rotation={[0, 0, Math.PI / 3]}
						scale={[100, 0.1, 1]}
					/>
					<Lightformer
						intensity={10}
						color="white"
						position={[-10, 0, 14]}
						rotation={[0, Math.PI / 2, Math.PI / 3]}
						scale={[100, 10, 1]}
					/>
				</Environment>
			</Canvas>
		</Container>
	);
};

const Band = () => {
	const band = useRef<Mesh<MeshLineGeometry, MeshLineMaterial>>(null),
		fixed = useRef<RapierRigidBody>(null),
		j1 = useRef<RapierRigidBody>(null),
		j2 = useRef<RapierRigidBody>(null),
		j3 = useRef<RapierRigidBody>(null),
		card = useRef<RapierRigidBody>(null);
	const { vec, ang, rot, dir } = useMemo(
		() => ({
			vec: new Vector3(),
			ang: new Vector3(),
			rot: new Vector3(),
			dir: new Vector3(),
		}),
		[],
	);
	const segmentProps = {
		type: "dynamic",
		canSleep: true,
		colliders: false,
		angularDamping: 2,
		linearDamping: 2,
	} satisfies Pick<
		RigidBodyOptions,
		"type" | "canSleep" | "colliders" | "angularDamping" | "linearDamping"
	>;
	const { nodes, materials } = useGLTF(asset("/card/tag.glb"));
	const texture = useTexture(asset("/card/band.jpeg"));
	const { width, height } = useThree((state) => state.size);
	const lineMaterialParameters = useMemo(
		() => ({ resolution: new Vector2(width, height) }),
		[width, height],
	);
	const curve = useMemo(() => {
		return new CatmullRomCurve3([
			new Vector3(),
			new Vector3(),
			new Vector3(),
			new Vector3(),
		]);
	}, []);
	const [dragged, drag] = useState<false | Vector3>(false);
	const [hovered, hover] = useState(false);

	// Rapier checks nullable refs at runtime; its declarations still assume React 18 refs.
	useRopeJoint(
		fixed as RefObject<RapierRigidBody>,
		j1 as RefObject<RapierRigidBody>,
		[[0, 0, 0], [0, 0, 0], 1],
	);
	useRopeJoint(
		j1 as RefObject<RapierRigidBody>,
		j2 as RefObject<RapierRigidBody>,
		[[0, 0, 0], [0, 0, 0], 1],
	);
	useRopeJoint(
		j2 as RefObject<RapierRigidBody>,
		j3 as RefObject<RapierRigidBody>,
		[[0, 0, 0], [0, 0, 0], 1],
	);
	useSphericalJoint(
		j3 as RefObject<RapierRigidBody>,
		card as RefObject<RapierRigidBody>,
		[
			[0, 0, 0],
			[0, 1.45, 0],
		],
	);

	useEffect(() => {
		if (hovered) {
			document.body.style.cursor = dragged ? "grabbing" : "grab";
			return () => {
				document.body.style.cursor = "auto";
			};
		}
	}, [hovered, dragged]);

	useFrame((state) => {
		if (dragged) {
			vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
			dir.copy(vec).sub(state.camera.position).normalize();
			vec.add(dir.multiplyScalar(state.camera.position.length()));
			[card, j1, j2, j3, fixed].forEach((ref) => {
				ref.current?.wakeUp();
			});
			card.current?.setNextKinematicTranslation({
				x: vec.x - dragged.x,
				y: vec.y - dragged.y,
				z: vec.z - dragged.z,
			});
		}
		const bodies = [j3.current, j2.current, j1.current, fixed.current];
		const cardBody = card.current;
		const bandMesh = band.current;
		if (cardBody && bandMesh && bodies.every((body) => body !== null)) {
			// Calculate Catmull-Rom curve from initialized physics bodies.
			bodies.forEach((body, index) => {
				if (body) curve.points[index].copy(body.translation());
			});
			bandMesh.geometry.setPoints(curve.getPoints(32));
			// Tilt it back towards the screen.
			ang.copy(cardBody.angvel());
			const rotation = cardBody.rotation();
			rot.set(rotation.x, rotation.y, rotation.z);
			cardBody.setAngvel(
				{ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z },
				false,
			);
		}
	});

	curve.curveType = "chordal";
	texture.wrapS = texture.wrapT = RepeatWrapping;

	return (
		<>
			<group position={[0, 4, 0]}>
				<RigidBody ref={fixed} {...segmentProps} />
				<RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
					<BallCollider args={[0.1]} />
				</RigidBody>
				<RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
					<BallCollider args={[0.1]} />
				</RigidBody>
				<RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
					<BallCollider args={[0.1]} />
				</RigidBody>
				<RigidBody
					position={[2.0, 0, 0]}
					ref={card}
					{...segmentProps}
					type={dragged ? "kinematicPosition" : "dynamic"}
				>
					<CuboidCollider args={[0.8, 1.125, 0.01]} />
					<group
						scale={2.25}
						position={[0, -1.2, -0.05]}
						onPointerOver={() => hover(true)}
						onPointerOut={() => hover(false)}
						onPointerUp={(e) => {
							(e.target as unknown as Element).releasePointerCapture(
								e.pointerId,
							);
							drag(false);
						}}
						onPointerDown={(e) => {
							const body = card.current;
							if (!body) return;
							(e.target as unknown as Element).setPointerCapture(e.pointerId);
							drag(
								new Vector3().copy(e.point).sub(vec.copy(body.translation())),
							);
						}}
					>
						<mesh geometry={(nodes.card as Mesh).geometry}>
							<meshPhysicalMaterial
								map={(materials.base as MeshPhysicalMaterial).map}
								map-anisotropy={16}
								clearcoat={1}
								clearcoatRoughness={0.15}
								roughness={0.3}
								metalness={0.5}
							/>
						</mesh>
						<mesh
							geometry={(nodes.clip as Mesh).geometry}
							material={materials.metal}
							material-roughness={0.3}
						/>
						<mesh
							geometry={(nodes.clamp as Mesh).geometry}
							material={materials.metal}
						/>
					</group>
				</RigidBody>
			</group>
			<mesh ref={band}>
				<meshLineGeometry />
				<meshLineMaterial
					args={[lineMaterialParameters]}
					color="white"
					depthTest={false}
					resolution={[width, height]}
					useMap={1}
					map={texture}
					repeat={[-3, 1]}
					lineWidth={1}
				/>
			</mesh>
		</>
	);
};

export default Demo0302;

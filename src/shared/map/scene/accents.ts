import {
	AdditiveBlending,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	RepeatWrapping,
	SRGBColorSpace,
	type Texture,
	Vector3,
	type Vector3Like,
} from "three";
import type Assets from "../assets";
import Plane from "../world-core/components/plane";
import type { SceneContext } from "./types";

export function createGlowPillar(
	assets: Assets | undefined,
	h: number,
	color: number,
) {
	const geometry = new PlaneGeometry(0.35, h);
	geometry.translate(0, h / 2, 0);
	const texture = assets?.instance.getResource("huiguang") as Texture;
	if (!texture) {
		throw new Error("huiguang texture not found");
	}
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	const material = new MeshBasicMaterial({
		color: color,
		map: texture,
		transparent: true,
		opacity: 0.4,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending,
	});
	const mesh = new Mesh(geometry, material);
	mesh.renderOrder = 10;
	mesh.rotateX(Math.PI / 2);
	const mesh2 = mesh.clone();
	const mesh3 = mesh.clone();
	mesh2.rotateY((Math.PI / 180) * 60);
	mesh3.rotateY((Math.PI / 180) * 120);
	return [mesh, mesh2, mesh3];
}

export function createBarHalo(
	assets: Assets | undefined,
	position: Vector3Like,
) {
	const guangquan1 = assets?.instance.getResource("guangquan1") as Texture;
	const guangquan2 = assets?.instance.getResource("guangquan2") as Texture;
	if (!guangquan1 || !guangquan2) {
		throw new Error("guangquan1 or guangquan2 not found");
	}
	const geometry = new PlaneGeometry(0.5, 0.5);
	const material1 = new MeshBasicMaterial({
		color: 0xffffff,
		map: guangquan1,
		alphaMap: guangquan1,
		opacity: 1,
		transparent: true,
		depthTest: false,
		fog: false,
		blending: AdditiveBlending,
	});
	const material2 = new MeshBasicMaterial({
		color: 0xffffff,
		map: guangquan2,
		alphaMap: guangquan2,
		opacity: 1,
		transparent: true,
		depthTest: false,
		fog: false,
		blending: AdditiveBlending,
	});
	const mesh1 = new Mesh(geometry, material1);
	const mesh2 = new Mesh(geometry, material2);
	mesh1.renderOrder = 6;
	mesh2.renderOrder = 6;
	mesh1.rotateX(-Math.PI / 2);
	mesh2.rotateX(-Math.PI / 2);
	mesh1.position.copy(position);
	mesh2.position.copy(position);
	mesh2.position.y -= 0.001;
	mesh1.scale.set(0, 0, 0);
	mesh2.scale.set(0, 0, 0);
	const quanGroup = new Group();
	quanGroup.add(mesh1, mesh2);
	return { group: quanGroup, rotatingMesh: mesh1 };
}

export function createRotationBorders({
	scene,
	time,
	assets,
}: SceneContext): [Mesh, Mesh] {
	const max = 12;
	const rotationBorder1 = assets?.instance.getResource("rotationBorder1") as
		| Texture
		| undefined;
	const rotationBorder2 = assets?.instance.getResource("rotationBorder2") as
		| Texture
		| undefined;
	if (!rotationBorder1 || !rotationBorder2) {
		throw new Error("rotationBorder1 or rotationBorder2 not found");
	}
	const plane01 = new Plane(
		{ time: time },
		{
			width: max * 1.178,
			needRotate: true,
			rotateSpeed: 0.001,
			material: new MeshBasicMaterial({
				map: rotationBorder1,
				color: 0x48afff,
				transparent: true,
				opacity: 0.2,
				side: DoubleSide,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
			position: new Vector3(0, 0.28, 0),
		},
	);
	plane01.instance.rotation.x = -Math.PI / 2;
	plane01.instance.renderOrder = 6;
	plane01.instance.scale.set(0, 0, 0);
	plane01.setParent(scene);

	const plane02 = new Plane(
		{ time: time },
		{
			width: max * 1.116,
			needRotate: true,
			rotateSpeed: -0.004,
			material: new MeshBasicMaterial({
				map: rotationBorder2,
				color: 0x48afff,
				transparent: true,
				opacity: 0.4,
				side: DoubleSide,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
			position: new Vector3(0, 0.3, 0),
		},
	);
	plane02.instance.rotation.x = -Math.PI / 2;
	plane02.instance.renderOrder = 6;
	plane02.instance.scale.set(0, 0, 0);
	plane02.setParent(scene);
	return [plane01.instance, plane02.instance];
}

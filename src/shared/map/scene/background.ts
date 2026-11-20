import gsap from "gsap";
import {
	AddEquation,
	CustomBlending,
	DstColorFactor,
	Mesh,
	MeshBasicMaterial,
	NearestFilter,
	OneFactor,
	PlaneGeometry,
	RepeatWrapping,
	SRGBColorSpace,
	type Texture,
} from "three";
import Grid from "../world-core/components/grid";
import DiffuseShader from "../world-core/shader/diffuse-shader";
import type { SceneContext } from "./types";

export function createMapGrid({ scene, time }: SceneContext) {
	new Grid(
		{
			scene: scene,
			time: time,
		},
		{
			gridSize: 50,
			gridDivision: 20,
			gridColor: 0x1b4b70,
			shapeSize: 0.5,
			shapeColor: 0x2a5f8a,
			pointSize: 0.1,
			pointColor: 0x154d7d,
		},
	);
}

export function createMapOcean({ scene, assets }: SceneContext) {
	const geometry = new PlaneGeometry(20, 20);
	const texture = assets?.instance.getResource("ocean") as Texture | undefined;
	if (!texture) {
		throw new Error("ocean texture not found");
	}
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.set(1, 1);
	const material = new MeshBasicMaterial({
		map: texture,
		opacity: 1,
		fog: false,
	});
	const mesh = new Mesh(geometry, material);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(0, -0.7, 0);
	scene.add(mesh);
}

export function createMapDiffuse({ scene, time }: SceneContext) {
	const geometry = new PlaneGeometry(200, 200);
	const material = new MeshBasicMaterial({
		color: 0x000000,
		depthWrite: false,
		transparent: true,
		blending: CustomBlending,
	});
	material.blendEquation = AddEquation;
	material.blendSrc = DstColorFactor;
	material.blendDst = OneFactor;
	new DiffuseShader({
		material,
		time: time,
		size: 60,
		diffuseSpeed: 8.0,
		diffuseColor: 0x71918e,
		diffuseWidth: 2.0,
		callback: (pointShader) => {
			setTimeout(() => {
				gsap.to(pointShader.uniforms.uTime, {
					value: 4,
					repeat: -1,
					duration: 6,
					ease: "power1.easeIn",
				});
			}, 3);
		},
	});
	const mesh = new Mesh(geometry, material);
	mesh.renderOrder = 3;
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(0, 0.21, 0);
	scene.add(mesh);
}

export function createMapBlurLine({ scene, assets }: SceneContext) {
	const geometry = new PlaneGeometry(147, 147);
	const texture = assets?.instance.getResource("chinaBlurLine") as
		| Texture
		| undefined;
	if (!texture) {
		throw new Error("chinaBlurLine not found");
	}
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = RepeatWrapping;
	texture.wrapT = RepeatWrapping;
	texture.generateMipmaps = false;
	texture.minFilter = NearestFilter;
	texture.repeat.set(1, 1);
	const material = new MeshBasicMaterial({
		color: 0x3f82cd,
		alphaMap: texture,
		transparent: true,
		opacity: 0.5,
	});
	const mesh = new Mesh(geometry, material);
	mesh.rotateX(-Math.PI / 2);
	mesh.position.set(-19.3, -0.5, -19.7);
	scene.add(mesh);
}

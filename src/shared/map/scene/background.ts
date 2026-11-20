/**
 * 地图背景层：网格底、海面、扩散光波与模糊边线。
 * 位于地图主体之下（y 更小），由各屏 world 在初始化时依次调用创建，营造纵深与科技感。
 */
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

/**
 * 铺一层 50×50 的网格地面，用作地图底衬。
 * 网格的呼吸动画由 Grid 组件内部依赖 time 自行驱动，这里只负责配色与密度。
 */
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

/**
 * 在最底层铺一张 20×20 的海面贴图。
 * 位置压到 y = -0.7，低于网格与地图，形成「海面 → 网格 → 陆地」的层次。
 */
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

/**
 * 铺一层全屏扩散光波，用自定义 shader 做周期性涟漪。
 * 混合模式为「目标色 × 源 + 目标色」，等价于在原图之上做提亮，因此背景越亮涟漪越明显。
 */
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
			// 延迟 3ms 再启动补间，等 shader 完成首次编译、uniform 已挂载
			setTimeout(() => {
				// uTime 从 0 补到 4 后无限循环，形成持续的扩散脉冲
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

/**
 * 在板块外围叠一张模糊线条贴图，补足地图边缘的光晕。
 * 用 NearestFilter 且关闭 mipmap：贴图本身是光斑，放大后不需要插值，可省显存也避免糊边。
 */
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

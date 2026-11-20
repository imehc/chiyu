/**
 * 地图点缀元素工厂：光柱、柱子底部光圈、旋转装饰边框。
 * 由各屏 world 类在搭建场景时调用，依赖 Assets 提供贴图；返回的 mesh 由调用方加入对应 Group 并补间入场。
 */
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

/**
 * 创建竖直光柱：用三张交叉的透明平面模拟体积光。
 * @param assets 资源加载器，取 huiguang 贴图
 * @param h 光柱高度（世界坐标）
 * @param color 光柱颜色，0x 十六进制
 * @returns 三张沿 y 轴旋转 0°/60°/120° 的平面，需调用方自行加入场景
 */
export function createGlowPillar(
	assets: Assets | undefined,
	h: number,
	color: number,
) {
	const geometry = new PlaneGeometry(0.35, h);
	// 把几何体原点平移到柱底，这样 mesh 摆在地面时直接对位，不用再算半高
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
	// 叠加混合的元素抬高渲染顺序，避免被地图表面按深度提前盖住
	mesh.renderOrder = 10;
	// 平面默认位于 xy 平面，绕 x 轴转 90° 后躺平到 xz 平面，竖直由调用方旋转父组实现
	mesh.rotateX(Math.PI / 2);
	const mesh2 = mesh.clone();
	const mesh3 = mesh.clone();
	mesh2.rotateY((Math.PI / 180) * 60);
	mesh3.rotateY((Math.PI / 180) * 120);
	return [mesh, mesh2, mesh3];
}

/**
 * 创建柱子底部的双层光圈。
 * 两张同心圆面片共用一个几何体，第二张微下沉 0.001 以避免 z-fighting。
 * @param position 光圈中心的世界坐标，通常与柱子底部对齐
 * @returns group 为光圈组合，rotatingMesh 供调用方做持续旋转
 */
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
	// 初始缩到 0，入场时由外部补间放大，形成从柱底绽开的效果
	mesh1.scale.set(0, 0, 0);
	mesh2.scale.set(0, 0, 0);
	const quanGroup = new Group();
	quanGroup.add(mesh1, mesh2);
	return { group: quanGroup, rotatingMesh: mesh1 };
}

/**
 * 创建地图外围的两圈旋转装饰边框。
 * 两圈转向相反（rotateSpeed 一正一负）形成交织感；宽度略大于地图本身，营造托底光环。
 * @returns 依次为外圈与内圈 mesh，供调用方做透明度或缩放补间
 */
export function createRotationBorders({
	scene,
	time,
	assets,
}: SceneContext): [Mesh, Mesh] {
	// 地图基准宽度，两圈在此之上分别放大 1.178 / 1.116 倍
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
	// 与光圈一致，先从 0 开始，由入场时间轴放大
	plane01.instance.scale.set(0, 0, 0);
	plane01.setParent(scene);

	// 内圈转向取负值，与外圈反向旋转
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

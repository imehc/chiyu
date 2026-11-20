/**
 * 动态图层：飞线（曲面管）+ 箭头散点。
 * 只往调用方已有的 Group 里塞 mesh，不负责创建和销毁 Group，
 * 由各屏 world 在数据就绪后调用，并通过 project 把经纬度落到平面上。
 */
import {
	AdditiveBlending,
	type Group,
	Mesh,
	MeshBasicMaterial,
	QuadraticBezierCurve3,
	RepeatWrapping,
	Sprite,
	SpriteMaterial,
	type Texture,
	TubeGeometry,
	Vector3,
} from "three";
import type Assets from "../assets";
import type Time from "../utils/time";
import type { MapPoint, ProjectPoint } from "./types";

/** 图层工厂的上下文：资源、目标 Group、投影函数与图层高度 */
interface LayerContext {
	assets?: Assets;
	group: Group;
	project: ProjectPoint;
	/** 图层所在的世界坐标高度，飞线与散点在此基础上再加偏移 */
	depth: number;
}
/** 散点业务数据，经纬度为度（十进制） */
interface ScatterPoint {
	lng: number;
	lat: number;
	/** 权重，用于映射箭头大小 */
	value: number;
}

/**
 * 以中心点为起点，向各目标区域画一条向上拱起的贝塞尔飞线。
 * 只往大屏已经建好的 Group 里追加 mesh，不接管它的生命周期。
 * 贴图 offset 在 time 的 tick 里持续左移，形成流光效果。
 * @param center 飞线汇聚点经纬度
 * @param getDestinations 惰性获取目标区域列表，取其中的 centroid 作为终点
 */
export function populateMapFlyLines(
	{ assets, group, project, depth }: LayerContext,
	time: Time,
	center: MapPoint,
	getDestinations: () => { centroid: number[] }[],
) {
	const texture = assets?.instance.getResource("mapFlyline") as Texture;
	if (!texture) {
		throw new Error("mapFlyline texture not found");
	}
	texture.wrapS = texture.wrapT = RepeatWrapping;
	// v 方向重复两次，让流光条纹更密，避免管线过长时贴图被拉花
	texture.repeat.set(0.5, 2);
	const tubeRadius = 0.1;
	const tubeSegments = 32;
	const tubeRadialSegments = 2;
	const closed = false;
	const [centerX, centerY] = project(center);
	// 投影结果的 y 轴向下，Three.js 的 y 轴向上，故取负号翻正
	const centerPoint = new Vector3(centerX, -centerY, 0);
	const material = new MeshBasicMaterial({
		map: texture,
		color: 0x2a6f72,
		transparent: true,
		fog: false,
		opacity: 1,
		depthTest: false,
		blending: AdditiveBlending,
	});
	time.on("tick", () => {
		// 每帧固定步长推进贴图偏移，配合 RepeatWrapping 形成无缝流光
		texture.offset.x -= 0.006;
	});
	getDestinations().forEach((region) => {
		const [x, y] = project(region.centroid as MapPoint);
		const point = new Vector3(x, -y, 0);
		const center = new Vector3();
		center.addVectors(centerPoint, point).multiplyScalar(0.5);
		// 控制点抬到 z = 3，让管线拱起成弧，避免平铺在地面上与地块互相穿插
		center.setZ(3);
		const curve = new QuadraticBezierCurve3(centerPoint, center, point);
		const tubeGeometry = new TubeGeometry(
			curve,
			tubeSegments,
			tubeRadius,
			tubeRadialSegments,
			closed,
		);
		const mesh = new Mesh(tubeGeometry, material);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(0, depth + 0.44, 0);
		mesh.renderOrder = 21;
		group.add(mesh);
	});
}

/**
 * 把散点画成始终朝向相机的箭头 Sprite。
 * 权重映射为 0.1~0.3 的缩放，最大值取列表首项（调用方需先按 value 降序排序）。
 * @param getPoints 惰性获取散点数据
 */
export function populateMapScatter(
	{ assets, group, project, depth }: LayerContext,
	getPoints: () => ScatterPoint[],
) {
	const texture = assets?.instance.getResource("arrow") as Texture;
	if (!texture) {
		throw new Error("arrow texture not found");
	}
	const material = new SpriteMaterial({
		map: texture,
		color: 0xfffef4,
		fog: false,
		transparent: true,
		depthTest: false,
	});
	const scatterAllData = getPoints();
	const max = scatterAllData[0].value;
	scatterAllData.forEach((data) => {
		const sprite = new Sprite(material);
		// 散点用独立的 renderOrder，确保压在飞线与地块之上
		sprite.renderOrder = 23;
		// 以首项（最大值）为基准归一化，保证最强点的箭头固定为 0.3 倍
		const scale = 0.1 + (data.value / max) * 0.2;
		sprite.scale.set(scale, scale, scale);
		const [x, y] = project([data.lng, data.lat]);
		sprite.position.set(x, -y, depth + 0.45);
		// 缓存一份原始坐标，便于后续做脉冲或筛选时还原位置
		sprite.userData.position = [x, -y, depth + 0.45];
		group.add(sprite);
	});
}

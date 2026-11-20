/**
 * 场景光照配置：环境光 + 平行光（带阴影）+ 两盏青色点光源。
 * 由各屏 world 初始化时调用一次，只影响带光照的材质（地块顶面、侧面等）。
 */
import {
	AmbientLight,
	type ColorRepresentation,
	DirectionalLight,
	PointLight,
	type Scene,
} from "three";

/** 点光源的世界坐标与强度参数 */
interface PointLightOptions {
	x: number;
	y: number;
	z: number;
	color?: ColorRepresentation;
	/** 光强，开启物理光照后该值通常需要很大（数百量级） */
	intensity?: number;
	/** 衰减距离，超出后光强归零 */
	distance?: number;
}
/** 按参数创建点光源并直接加入场景，无返回值 */
function addPointLight(scene: Scene, pointParam: PointLightOptions) {
	const pointLight = new PointLight(
		pointParam.color,
		pointParam.intensity,
		pointParam.distance,
	);
	pointLight.position.set(pointParam.x, pointParam.y, pointParam.z);
	scene.add(pointLight);
}

/**
 * 搭建地图的基础光照。
 * 环境光压低明暗对比、平行光负责主光与投影、两盏点光从侧前方补青色冷调。
 */
export function createMapEnvironment(scene: Scene) {
	const sun = new AmbientLight(0xffffff, 5);
	scene.add(sun);
	const directionalLight = new DirectionalLight(0xffffff, 5);
	directionalLight.position.set(-30, 6, -8);
	directionalLight.castShadow = true;
	// radius 越大阴影边缘越软；mapSize 固定 1024 是清晰度与显存之间的折中
	directionalLight.shadow.radius = 20;
	directionalLight.shadow.mapSize.width = 1024;
	directionalLight.shadow.mapSize.height = 1024;
	scene.add(directionalLight);
	addPointLight(scene, {
		color: "#1d5e5e",
		intensity: 800,
		distance: 10000,
		x: -9,
		y: 3,
		z: -3,
	});
	addPointLight(scene, {
		color: "#1d5e5e",
		intensity: 200,
		distance: 10000,
		x: 0,
		y: 2,
		z: 5,
	});
}

import {
	AmbientLight,
	type ColorRepresentation,
	DirectionalLight,
	PointLight,
	type Scene,
} from "three";

interface PointLightOptions {
	x: number;
	y: number;
	z: number;
	color?: ColorRepresentation;
	intensity?: number;
	distance?: number;
}
function addPointLight(scene: Scene, pointParam: PointLightOptions) {
	const pointLight = new PointLight(
		pointParam.color,
		pointParam.intensity,
		pointParam.distance,
	);
	pointLight.position.set(pointParam.x, pointParam.y, pointParam.z);
	scene.add(pointLight);
}

export function createMapEnvironment(scene: Scene) {
	const sun = new AmbientLight(0xffffff, 5);
	scene.add(sun);
	const directionalLight = new DirectionalLight(0xffffff, 5);
	directionalLight.position.set(-30, 6, -8);
	directionalLight.castShadow = true;
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

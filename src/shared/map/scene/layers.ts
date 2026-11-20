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

interface LayerContext {
	assets?: Assets;
	group: Group;
	project: ProjectPoint;
	depth: number;
}
interface ScatterPoint {
	lng: number;
	lat: number;
	value: number;
}

/** Adds the existing curved routes to a group already owned by its screen. */
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
	texture.repeat.set(0.5, 2);
	const tubeRadius = 0.1;
	const tubeSegments = 32;
	const tubeRadialSegments = 2;
	const closed = false;
	const [centerX, centerY] = project(center);
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
		texture.offset.x -= 0.006;
	});
	getDestinations().forEach((region) => {
		const [x, y] = project(region.centroid as MapPoint);
		const point = new Vector3(x, -y, 0);
		const center = new Vector3();
		center.addVectors(centerPoint, point).multiplyScalar(0.5);
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
		sprite.renderOrder = 23;
		const scale = 0.1 + (data.value / max) * 0.2;
		sprite.scale.set(scale, scale, scale);
		const [x, y] = project([data.lng, data.lat]);
		sprite.position.set(x, -y, depth + 0.45);
		sprite.userData.position = [x, -y, depth + 0.45];
		group.add(sprite);
	});
}

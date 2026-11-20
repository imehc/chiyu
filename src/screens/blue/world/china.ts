import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
	BufferGeometry,
	ExtrudeGeometry,
	Group,
	Line,
	LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	QuadraticBezierCurve3,
	ShapeGeometry,
	type Sprite,
	Vector3,
} from "three";
import chinaInfoPoints from "../../china/data/info";
import { chinaRegions } from "../../china/data/regions";
import chinaScatterPoints from "../../china/data/scatter";
import type MapEffects from "../map-effects";
import { CHINA_MAP_DEPTH } from "./constants";
import { type default as MapGeometry, polygonsOf } from "./geometry";
import type MapLabels from "./labels";
import type MapOverlays from "./overlays";
import type SceneTextures from "./textures";
import type { Layer, MapFeature } from "./types";

export default class ChinaScene {
	readonly map = new Group();
	readonly root = new Group();
	readonly labels = new Group();
	readonly layers: Record<Layer, Group> = {
		flyline: new Group(),
		label: new Group(),
		point: new Group(),
		scatter: new Group(),
		heat: new Group(),
		region: new Group(),
		scan: new Group(),
	};
	readonly surrounding = new Group();
	readonly orbitRing = new Group();
	readonly background = new Group();
	readonly regionMeshes: Mesh[] = [];
	readonly monitoringMarkers: Sprite[] = [];

	constructor(
		private readonly geometry: MapGeometry,
		private readonly textures: SceneTextures,
		private readonly overlays: MapOverlays,
		private readonly mapEffects: MapEffects,
		private readonly createLabel: MapLabels["create"],
	) {}

	createChina(
		data: FeatureCollection<Polygon | MultiPolygon>,
		outline: FeatureCollection<Polygon | MultiPolygon>,
	) {
		const sideMaterial = this.geometry.sideMaterial(CHINA_MAP_DEPTH);
		for (const feature of data.features) {
			const name = feature.properties?.name as string;
			if (!name) {
				this.geometry.lines(feature, this.map, 0.02, "#678dad", 0.38);
				continue;
			}
			const shapes = this.geometry.shapes(feature);
			if (!shapes.length) continue;
			const geometry = new ExtrudeGeometry(shapes, {
				depth: CHINA_MAP_DEPTH,
				bevelEnabled: false,
				curveSegments: 1,
			});
			const top = this.geometry.topMaterial();
			const mesh = new Mesh(geometry, [top, sideMaterial]);
			mesh.userData = { name, feature, top };
			this.map.add(mesh);
			this.regionMeshes.push(mesh);
			this.geometry.lines(
				feature,
				this.map,
				CHINA_MAP_DEPTH + 0.006,
				"#bfe3ff",
				0.8,
			);
			const center = (feature.properties?.centroid ??
				feature.properties?.center) as [number, number] | undefined;
			if (center && !["香港特别行政区", "澳门特别行政区"].includes(name)) {
				const labelCenter: [number, number] =
					name === "山西省"
						? [111.0, 37.2]
						: name === "天津市"
							? [119.8, 39.7]
							: center;
				const label = this.createLabel(
					name,
					this.geometry.point(labelCenter, CHINA_MAP_DEPTH + 0.018),
					false,
					14,
				);
				this.layers.label.add(label);
				if (name === "天津市") {
					this.layers.label.add(
						new Line(
							new BufferGeometry().setFromPoints([
								this.geometry.point(center, CHINA_MAP_DEPTH + 0.06),
								this.geometry.point([118.7, 39.7], CHINA_MAP_DEPTH + 0.06),
							]),
							new LineBasicMaterial({
								color: "#8ab0cd",
								transparent: true,
								opacity: 0.38,
							}),
						),
					);
				}
			}
			const tint = new Mesh(
				new ShapeGeometry(shapes),
				new MeshBasicMaterial({
					color: ["#26628a", "#384faf", "#225981", "#276770"][
						this.regionMeshes.length % 4
					],
					transparent: true,
					opacity: 0.34,
					depthWrite: false,
				}),
			);
			tint.position.z = CHINA_MAP_DEPTH + 0.014;
			this.layers.region.add(tint);
		}
		for (const feature of outline.features) {
			this.createBorderGlow(feature, this.map, CHINA_MAP_DEPTH);
			this.geometry.lines(feature, this.map, 0.006, "#c29a62", 0.64, true);
		}
		const title = this.textures.sprite("中国\nCHINA", {
			size: 76,
			color: "#ffffff",
			width: 384,
			height: 192,
			bold: true,
		});
		title.scale.set(4.4, 1.8, 1);
		title.position.set(6.27, -6.35, 0.78);
		this.labels.add(title);
	}

	createBorderGlow(
		feature: MapFeature,
		parent = this.map,
		depth = 0.36,
		spatialScale = 1,
	) {
		const rings = polygonsOf(feature).map((polygon) =>
			this.geometry
				.simplifyRing(polygon[0], 0.006 * spatialScale)
				.map(
					(point) =>
						new Vector3(point.x, point.y, depth + 0.008 * spatialScale),
				),
		);
		const stroke = this.mapEffects.stroke(
			rings,
			spatialScale,
			parent.userData.materialBounds as Vector3 | undefined,
		);
		parent.add(stroke);
		return stroke;
	}

	createSurrounding(countries: FeatureCollection<Polygon | MultiPolygon>) {
		const group = this.surrounding;
		group.name = "ChinaSurroundingContext";
		group.rotation.x = -Math.PI / 2;
		group.position.y = this.map.position.y - 0.08;
		const shapes = countries.features.flatMap((feature) =>
			/China|中国|中华人民共和国/i.test(String(feature.properties?.name ?? ""))
				? []
				: this.geometry.shapes(feature),
		);
		const land = new Mesh(
			new ShapeGeometry(shapes),
			this.geometry.contextMaterial(
				new MeshBasicMaterial({
					color: "#142d40",
					transparent: true,
					opacity: 0.74,
				}),
			),
		);
		land.name = "SurroundingLandSilhouette";
		land.raycast = () => undefined;
		group.add(land);
		const countryNames: [string, [number, number]][] = [
			["哈萨克斯坦", [76, 44.2]],
			["俄罗斯", [111.5, 57.5]],
			["蒙古", [106.5, 46.4]],
			["朝鲜", [130.3, 39.2]],
			["日本", [139.5, 36.7]],
			["印度", [80.0, 29.0]],
			["缅甸", [94.8, 23.6]],
			["老挝", [103.8, 18.6]],
			["越南", [108.6, 14.7]],
		];
		for (const [name, coordinates] of countryNames) {
			const label = this.createLabel(
				name,
				this.geometry.point(coordinates, 0.06),
				false,
				12,
				"context",
			);
			group.add(label);
		}
		this.background.add(group);
	}

	createCityMarkers() {
		chinaInfoPoints.forEach((item, index) => {
			const position = this.geometry.point(
				[item.lng, item.lat],
				CHINA_MAP_DEPTH + 0.06,
			);
			const info = this.mapEffects.info(position, index);
			this.layers.point.add(info.group, info.marker);
			this.monitoringMarkers.push(info.marker);
		});
	}

	createScatter() {
		for (const item of chinaScatterPoints)
			this.layers.scatter.add(
				this.mapEffects.scatter(
					this.geometry.point([item.lng, item.lat], CHINA_MAP_DEPTH + 0.08),
					0.09 + (item.value / 196) * 0.08,
				),
			);
	}

	createFlylines() {
		const center = this.geometry.point([104.3, 35.7], CHINA_MAP_DEPTH + 0.06);
		this.layers.flyline.add(this.mapEffects.focus(center));
		const names = [
			"广东省",
			"上海市",
			"四川省",
			"北京市",
			"新疆维吾尔自治区",
			"黑龙江省",
		];
		chinaRegions
			.filter((item) => names.includes(item.name))
			.forEach((item, index) => {
				const end = this.geometry.point(item.centroid, CHINA_MAP_DEPTH + 0.06);
				if (center.distanceTo(end) < 0.2) return;
				const middle = center.clone().lerp(end, 0.5);
				middle.z += Math.max(center.distanceTo(end) * 0.22, 0.6);
				const curve = new QuadraticBezierCurve3(center, middle, end);
				this.layers.flyline.add(this.mapEffects.flyline(curve, 1, index));
			});
	}

	createHeat() {
		const clusters: [number, number, number, number][] = [
			[87.5, 42.3, 1.6, 0.58],
			[88.6, 35.7, 1.7, 0.73],
			[103.2, 34, 2.0, 0.95],
			[106.0, 33.4, 2.2, 0.78],
			[108.6, 32.5, 1.9, 1],
			[113.2, 28, 1.9, 0.92],
			[118, 30, 2.3, 0.82],
			[120.0, 40.5, 2.0, 0.95],
			[125.0, 44.5, 1.9, 0.72],
		];
		this.layers.heat.add(
			this.overlays.createHeatSurface(
				clusters.map(([lon, lat, size, intensity]) => ({
					position: this.geometry.point([lon, lat], CHINA_MAP_DEPTH + 0.015),
					size,
					intensity,
				})),
			),
		);
		this.overlays.createAlertPoints(this.layers.point, [
			this.geometry.point([127.5, 45.7], CHINA_MAP_DEPTH + 0.06),
			this.geometry.point([100.4, 25.3], CHINA_MAP_DEPTH + 0.06),
			this.geometry.point([114.4, 41.1], CHINA_MAP_DEPTH + 0.06),
			this.geometry.point([108.9, 36.4], CHINA_MAP_DEPTH + 0.06),
		]);
	}
}

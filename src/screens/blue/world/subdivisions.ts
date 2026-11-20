import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import gsap from "gsap";
import {
	ExtrudeGeometry,
	type Group,
	Mesh,
	QuadraticBezierCurve3,
	type Vector3,
} from "three";
import { CHINA_MAP_DEPTH } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { MapFeature } from "./types";

interface SubdivisionsContext {
	state: Pick<
		WorldState,
		| "abortController"
		| "chinaScene"
		| "cityDataCache"
		| "destroyed"
		| "detailLoading"
		| "detailMeshes"
		| "detailTimeline"
		| "detailZoom"
		| "drilledLabels"
		| "drilledLayers"
		| "drilledPoints"
		| "geometry"
		| "mapEffects"
		| "overlays"
		| "reducedMotion"
		| "selectedRegion"
	>;
	controllers: () => Pick<WorldControllers, "frame">;
}

export default class Subdivisions {
	constructor(private readonly context: SubdivisionsContext) {}

	createDetailOverlays(
		feature: MapFeature,
		group: Group,
		scale: number,
		depth: number,
	) {
		const samples = this.context.state.geometry.sampleMap(
			feature,
			38,
			depth + 0.045 * scale,
		);
		if (!samples.length) return;
		const desiredFocus = group.userData.focus as Vector3;
		const focus = samples
			.reduce((best, point) =>
				point.distanceTo(desiredFocus) < best.distanceTo(desiredFocus)
					? point
					: best,
			)
			.clone();
		group.userData.focus = focus;
		this.context.state.drilledLayers.flyline?.add(
			this.context.state.mapEffects.focus(focus, scale),
		);
		samples.forEach((point, index) => {
			this.context.state.drilledLayers.scatter?.add(
				this.context.state.mapEffects.scatter(
					point,
					(0.1 + (index % 3) * 0.025) * scale,
				),
			);

			if (index >= 6) return;
			const info = this.context.state.mapEffects.info(point, index, scale);
			this.context.state.drilledPoints?.add(info.group, info.marker);
			this.context.state.chinaScene.monitoringMarkers.push(info.marker);
			if (focus.distanceTo(point) < 0.3 * scale) return;
			const middle = focus.clone().lerp(point, 0.5);
			middle.z += Math.max(focus.distanceTo(point) * 0.3, 0.4 * scale);
			this.context.state.drilledLayers.flyline?.add(
				this.context.state.mapEffects.flyline(
					new QuadraticBezierCurve3(focus, middle, point),
					scale,
					index,
				),
			);
		});
		this.context.state.drilledLayers.heat?.add(
			this.context.state.overlays.createHeatSurface(
				samples.slice(0, 10).map((point, index) => ({
					position: point.clone().setZ(depth + 0.018 * scale),
					size: (1.35 + (index % 3) * 0.24) * scale,
					intensity: 0.62 + (index % 4) * 0.12,
				})),
			),
		);
		if (this.context.state.drilledPoints)
			this.context.state.overlays.createAlertPoints(
				this.context.state.drilledPoints,
				samples.slice(10, 14),
				Math.min(scale, 1 / this.context.state.detailZoom),
			);
	}

	async loadSubdivisions(
		adcode: number,
		name: string,
		group: Group,
		animate = true,
	) {
		const instant = this.context.state.reducedMotion.matches || !animate;
		try {
			let data = this.context.state.cityDataCache.get(adcode);
			if (!data) {
				const response = await fetch(`/geojson/blue/${adcode}.json`, {
					signal: this.context.state.abortController.signal,
				});
				if (!response.ok) return;
				data = (await response.json()) as FeatureCollection<
					Polygon | MultiPolygon
				>;
				this.context.state.cityDataCache.set(adcode, data);
			}
			if (
				this.context.state.destroyed ||
				this.context.state.selectedRegion !== name ||
				group.parent !== this.context.state.chinaScene.map
			)
				return;
			const detailTimeline = gsap.timeline({
				onComplete: () => this.context.controllers().frame.revealMapNames(),
			});
			this.context.state.detailTimeline = detailTimeline;
			const spatialScale = Number(group.userData.spatialScale ?? 1);
			const baseDepth = Number(group.userData.baseDepth ?? CHINA_MAP_DEPTH);
			const detailDepth = 0.006 * spatialScale;
			const surface = baseDepth + detailDepth;
			const sideMaterial = this.context.state.geometry.sideMaterial(
				detailDepth,
				spatialScale,
			);
			const boundary = group.userData.boundary as Group;
			// Keep the existing silhouette while subdivision details resolve.
			detailTimeline.to(
				boundary.position,
				{
					z: detailDepth,
					duration: instant ? 0 : 0.65,
					ease: "sine.inOut",
				},
				0,
			);

			data.features.forEach((feature, index) => {
				const shapes = this.context.state.geometry.shapes(
					feature,
					0.012 * spatialScale,
				);
				if (!shapes.length) return;
				const reveal = { value: instant ? 1 : 0 };
				const revealStart = instant ? 0 : Math.min(index * 0.008, 0.12);
				const face = new Mesh(
					new ExtrudeGeometry(shapes, {
						depth: detailDepth,
						bevelEnabled: false,
						curveSegments: 1,
					}),
					[
						this.context.state.geometry.topMaterial(
							group.userData.materialBounds as Vector3,
							Number(group.userData.materialHeight),
							true,
							reveal,
						),
						sideMaterial,
					],
				);
				face.userData = {
					name: String(feature.properties?.name),
					feature,
					top: face.material[0],
				};
				this.context.state.detailMeshes.push(face);
				face.material[0].transparent = true;
				face.material[0].depthWrite = false;
				face.position.z = baseDepth + 0.001 * spatialScale;
				face.scale.z = instant ? 1 : 0.8;
				group.add(face);
				detailTimeline.to(
					reveal,
					{
						value: 1,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				detailTimeline.to(
					face.scale,
					{
						z: 1,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				const lineMaterial = this.context.state.geometry.lines(
					feature,
					group,
					surface + 0.014 * spatialScale,
					"#c8f5ff",
					0.86,
					false,
					spatialScale,
				);
				lineMaterial.opacity = instant ? 0.86 : 0;
				detailTimeline.to(
					lineMaterial,
					{
						opacity: 0.86,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				const center = (feature.properties?.centroid ??
					feature.properties?.center) as [number, number] | undefined;
				if (!center) return;

				const label = this.context
					.controllers()
					.frame.mapName(
						String(feature.properties?.name),
						this.context.state.geometry.point(
							center,
							surface + 0.018 * spatialScale,
						),
					);
				label.userData.mapName.reveal = reveal;
				this.context.state.drilledLabels?.add(label);
			});
		} catch (error) {
			if (
				!this.context.state.destroyed &&
				(error as Error).name !== "AbortError"
			)
				console.error("行政区划读取失败", error);
		} finally {
			if (group.parent === this.context.state.chinaScene.map)
				this.context.state.detailLoading = false;
		}
	}
}

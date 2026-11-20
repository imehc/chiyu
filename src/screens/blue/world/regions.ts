import {
	ExtrudeGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	type ShaderMaterial,
	ShapeGeometry,
	Vector3,
} from "three";
import { CHINA_MAP_DEPTH } from "./constants";
import type { WorldControllers } from "./controller-types";
import { polygonsOf } from "./geometry";
import type WorldState from "./state";
import type { Layer, MapCameraPose, MapFeature } from "./types";

interface RegionNavigationContext {
	state: Pick<
		WorldState,
		| "abortController"
		| "callbacks"
		| "cameraPitch"
		| "chinaData"
		| "chinaScene"
		| "cityDataCache"
		| "destroyed"
		| "detailHomeTarget"
		| "detailLoading"
		| "detailMeshes"
		| "detailTimeline"
		| "detailZoom"
		| "drillPath"
		| "drillViews"
		| "drilledLabels"
		| "drilledLayers"
		| "drilledPoints"
		| "geometry"
		| "globeScene"
		| "labelTween"
		| "layerEnabled"
		| "layerMotion"
		| "mapEffects"
		| "mapLabelOpacity"
		| "mapRotation"
		| "regionGeometry"
		| "regionRequest"
		| "requestedView"
		| "selectedRegion"
		| "switchingView"
		| "topView"
		| "transitionTimeline"
		| "view"
	>;
	controllers: () => Pick<
		WorldControllers,
		| "camera"
		| "cameraMotion"
		| "frame"
		| "interaction"
		| "resources"
		| "subdivisions"
		| "view"
	>;
}

const shortName = (name: string) =>
	name
		.replace("维吾尔自治区", "")
		.replace("壮族自治区", "")
		.replace("回族自治区", "")
		.replace("自治区", "")
		.replace("特别行政区", "")
		.replace(/[省市]$/, "");

export default class RegionNavigation {
	constructor(private readonly context: RegionNavigationContext) {}

	clearSubdivisions() {
		this.clearDetailGeometry();
		this.context.state.selectedRegion = undefined;
		this.context.state.drillPath.length = 0;
		this.context.state.drillViews.length = 0;
		this.context.state.detailZoom = 1;
		this.context.state.mapEffects.setRegion(0, 0, 15, CHINA_MAP_DEPTH);
		this.context.state.chinaScene.map.children.forEach((child) => {
			child.visible = true;
		});
		Object.values(this.context.state.chinaScene.layers).forEach((group) => {
			this.context.state.chinaScene.root.add(group);
		});
		this.context.state.callbacks.onDrillChange?.([]);
	}

	goBack() {
		if (
			!this.context.state.drillPath.length ||
			this.context.state.switchingView
		)
			return;
		if (this.context.state.regionGeometry.current) {
			this.context.state.regionGeometry.pendingBack = true;
			return;
		}
		this.context.state.regionRequest++;
		this.context.state.detailLoading = false;
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		const fromPose = this.context.controllers().camera.getMapCameraPose();
		this.context.state.regionGeometry.retainOutgoing();
		const returnPose = this.context.state.drillViews.pop();
		this.context.state.drillPath.pop();
		const parent = this.context.state.drillPath.at(-1);
		if (parent) {
			this.showRegion(parent, returnPose);
		} else {
			this.context.controllers().view.applyView("china");
			this.context.state.requestedView = "china";
			this.context.controllers().camera.restoreMapCameraPose(fromPose);
			this.context.state.regionGeometry.prepareIncoming(
				[
					...this.context.state.chinaScene.map.children.filter(
						(object) =>
							!object.userData.outgoingRegion &&
							object !== this.context.state.mapEffects.group,
					),
					this.context.state.chinaScene.labels,
					this.context.state.chinaScene.background,
					this.context.state.chinaScene.orbitRing,
					...Object.values(this.context.state.chinaScene.layers),
				],
				[
					this.context.state.chinaScene.labels,
					...Object.values(this.context.state.chinaScene.layers),
				],
				CHINA_MAP_DEPTH,
			);
			this.context
				.controllers()
				.cameraMotion.transitionRegionCamera(
					new Vector3(0.35, 0, 0),
					1,
					returnPose,
				);
		}
	}

	drilldown(name: string | number) {
		if (
			this.context.state.switchingView ||
			this.context.state.detailLoading ||
			this.context.state.regionGeometry.current
		)
			return;
		const candidates = this.context.state.drillPath.length
			? this.context.state.detailMeshes
			: this.context.state.chinaScene.regionMeshes;
		const mesh = candidates.find(
			(region) =>
				this.context.controllers().interaction.isVisible(region) &&
				(Number(region.userData.feature?.properties?.adcode) === Number(name) ||
					region.userData.name === name ||
					shortName(region.userData.name) === shortName(String(name))),
		);
		if (!mesh) return;
		const feature = mesh.userData.feature as MapFeature;
		if (
			this.context.state.drillPath.at(-1)?.properties?.adcode ===
			feature.properties?.adcode
		)
			return;
		void this.enterRegion(feature);
	}

	async enterRegion(feature: MapFeature) {
		const request = ++this.context.state.regionRequest;
		const adcode = Number(feature.properties?.adcode);
		this.context.state.detailLoading = true;
		try {
			if (
				adcode &&
				Number(feature.properties?.childrenNum) > 0 &&
				!this.context.state.cityDataCache.has(adcode)
			) {
				const response = await fetch(`/geojson/blue/${adcode}.json`, {
					signal: this.context.state.abortController.signal,
				});
				if (response.ok)
					this.context.state.cityDataCache.set(adcode, await response.json());
			}
		} catch (error) {
			if (
				!this.context.state.destroyed &&
				(error as Error).name !== "AbortError"
			)
				console.error("行政区划读取失败", error);
		}
		if (
			this.context.state.destroyed ||
			request !== this.context.state.regionRequest ||
			this.context.state.view !== "china"
		)
			return;
		this.context.state.detailLoading = false;
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.drillViews.push(
			this.context.controllers().camera.getMapCameraPose(),
		);
		this.context.state.regionGeometry.retainOutgoing();
		this.context.state.drillPath.push(feature);
		this.showRegion(feature);
	}

	clearDetailGeometry() {
		this.context.controllers().interaction.closeMonitoringPoint();
		this.context.state.detailLoading = false;
		this.context.controllers().interaction.setHovered(undefined);
		this.context.state.detailTimeline?.kill();
		this.context.state.detailTimeline = undefined;
		this.context.state.detailMeshes.length = 0;
		for (const child of [...this.context.state.chinaScene.map.children]) {
			if (!child.userData.drilldown) continue;
			this.context.controllers().resources.disposeObject(child);
			this.context.state.chinaScene.map.remove(child);
		}
		this.context.state.drilledLabels = undefined;
		this.context.state.drilledPoints = undefined;
		this.context.state.drilledLayers = {};
	}

	showRegion(feature: MapFeature, returnPose?: MapCameraPose) {
		this.context.controllers().cameraMotion.stopCameraControls();
		const fromPose = this.context.controllers().camera.getMapCameraPose();
		this.context.state.transitionTimeline?.kill();
		this.context.state.labelTween?.kill();
		if (!this.context.state.regionGeometry.current)
			this.context.state.mapLabelOpacity = 0;
		this.clearDetailGeometry();
		this.context.state.selectedRegion = String(feature.properties?.name);
		this.context.state.view = "china";
		this.context.state.mapRotation = 0;
		this.context.state.topView = false;
		this.context.state.cameraPitch = 0.72;
		this.context.controllers().camera.updateMapRotation();
		this.context.state.globeScene.root.visible = false;
		this.context.state.chinaScene.map.visible = true;
		if (!this.context.state.regionGeometry.current)
			this.context.state.chinaScene.labels.visible =
				this.context.state.chinaScene.background.visible =
				this.context.state.chinaScene.orbitRing.visible =
					false;
		Object.values(this.context.state.chinaScene.layers).forEach((layer) => {
			this.context.state.chinaScene.root.remove(layer);
		});
		this.context.state.chinaScene.map.children.forEach((child) => {
			if (!child.userData.outgoingRegion) child.visible = false;
		});
		const group = new Group();
		group.userData.drilldown = true;
		const coordinates = polygonsOf(feature).flatMap((polygon) =>
			polygon[0].map((coordinate) =>
				this.context.state.geometry.point([coordinate[0], coordinate[1]]),
			),
		);
		const rawWidth =
			Math.max(...coordinates.map((point) => point.x)) -
			Math.min(...coordinates.map((point) => point.x));
		const rawHeight =
			Math.max(...coordinates.map((point) => point.y)) -
			Math.min(...coordinates.map((point) => point.y));
		const precision = 0.004 * Math.min(1, Math.max(rawWidth, rawHeight) / 7.5);
		const mesh = new Mesh(
			new ExtrudeGeometry(
				this.context.state.geometry.shapes(feature, precision),
				{
					depth: CHINA_MAP_DEPTH,
					bevelEnabled: false,
					curveSegments: 1,
				},
			),
			[
				this.context.state.geometry.topMaterial(undefined, undefined, true),
				this.context.state.geometry.sideMaterial(),
			],
		);
		mesh.userData = {
			name: this.context.state.selectedRegion,
			feature,
			top: mesh.material[0],
		};
		group.add(mesh);
		this.context.state.drilledLabels = new Group();
		this.context.state.drilledPoints = new Group();
		this.context.state.drilledLayers = {
			label: this.context.state.drilledLabels,
			point: this.context.state.drilledPoints,
			flyline: new Group(),
			scatter: new Group(),
			heat: new Group(),
		};
		for (const [id, layer] of Object.entries(
			this.context.state.drilledLayers,
		)) {
			layer.userData.blueLayer = id;
			this.context.state.layerMotion.initialize(
				layer,
				this.context.state.layerEnabled[id as Layer],
			);
			group.add(layer);
		}
		this.context.state.chinaScene.map.add(group);
		mesh.geometry.computeBoundingBox();
		const bounds = mesh.geometry.boundingBox;
		if (!bounds) return;
		const center = bounds.getCenter(new Vector3());
		const size = bounds.getSize(new Vector3());
		const span = Math.max(size.x, size.y * 0.75, 0.000001);
		const spatialScale = Math.min(1, span / 7.5);
		const baseDepth = CHINA_MAP_DEPTH * spatialScale;
		(mesh.material[1] as ShaderMaterial).uniforms.wallScale.value =
			spatialScale;
		mesh.scale.z = spatialScale;
		const nextTarget = new Vector3(
			center.x,
			this.context.state.chinaScene.map.position.y + baseDepth * 0.6,
			-center.y,
		);
		const nextZoom = this.context
			.controllers()
			.camera.fitRegionZoom(mesh, nextTarget, spatialScale, span);
		group.userData.spatialScale = spatialScale;
		group.userData.baseDepth = baseDepth;
		group.userData.materialBounds = new Vector3(
			bounds.min.x,
			bounds.min.y,
			Math.max(size.x, size.y),
		);
		(mesh.userData.top as ShaderMaterial).uniforms.mapBounds.value.copy(
			group.userData.materialBounds,
		);
		group.userData.boundary = this.context.state.chinaScene.createBorderGlow(
			feature,
			group,
			baseDepth,
			spatialScale,
		);
		this.context.state.geometry.lines(
			feature,
			group,
			0.006 * spatialScale,
			"#c29a62",
			0.64,
			true,
			spatialScale,
		);

		this.context.state.mapEffects.setRegion(
			center.x,
			center.y,
			Math.max(size.x, size.y),
			baseDepth +
				(Number(feature.properties?.childrenNum) > 0
					? 0.006 * spatialScale
					: 0),
		);
		this.context.state.mapEffects.group.visible = true;
		group.userData.materialHeight = size.y;
		(mesh.userData.top as ShaderMaterial).uniforms.mapHeight.value = size.y;
		const parentCode = Number(
			this.context.state.drillPath.at(-2)?.properties?.adcode,
		);
		const neighbours = parentCode
			? this.context.state.cityDataCache.get(parentCode)
			: this.context.state.chinaData;
		for (const neighbour of neighbours?.features ?? []) {
			if (neighbour.properties?.adcode === feature.properties?.adcode) continue;
			const context = new Mesh(
				new ShapeGeometry(
					this.context.state.geometry.shapes(neighbour, precision),
				),
				this.context.state.geometry.contextMaterial(
					new MeshBasicMaterial({
						color: "#10253b",
						transparent: true,
						opacity: 0.32,
						depthWrite: false,
					}),
				),
			);
			context.position.z = -0.07 * spatialScale;
			group.add(context);
			this.context.state.geometry.lines(
				neighbour,
				group,
				-0.06 * spatialScale,
				"#507d9c",
				0.58,
				true,
				spatialScale,
				true,
			);
			const neighbourCenter = (neighbour.properties?.centroid ??
				neighbour.properties?.center) as [number, number] | undefined;
			if (neighbourCenter && neighbour.properties?.name) {
				this.context.state.drilledLabels.add(
					this.context
						.controllers()
						.frame.mapName(
							String(neighbour.properties.name),
							this.context.state.geometry.point(
								neighbourCenter,
								-0.04 * spatialScale,
							),
							false,
							12,
							"context",
						),
				);
			}
		}
		this.context.state.detailZoom = nextZoom;
		this.context.state.detailHomeTarget.copy(nextTarget);
		group.userData.focus = new Vector3(
			nextTarget.x,
			-nextTarget.z,
			baseDepth + 0.24 * spatialScale,
		);
		this.context
			.controllers()
			.subdivisions.createDetailOverlays(
				feature,
				group,
				spatialScale,
				baseDepth,
			);
		// Keep the camera's current angle until the same flight reaches its fitted view.
		this.context.controllers().camera.restoreMapCameraPose(fromPose);
		const adcode = Number(feature.properties?.adcode);
		const hasChildren = Number(feature.properties?.childrenNum) > 0;
		if (adcode && hasChildren && this.context.state.cityDataCache.has(adcode)) {
			void this.context
				.controllers()
				.subdivisions.loadSubdivisions(
					adcode,
					this.context.state.selectedRegion,
					group,
					false,
				);
		} else {
			const label = this.context
				.controllers()
				.frame.mapName(
					this.context.state.selectedRegion,
					new Vector3(center.x, center.y, baseDepth + 0.018 * spatialScale),
					true,
				);
			this.context.state.drilledLabels.add(label);
		}
		this.context.state.regionGeometry.prepareIncoming(
			[group],
			Object.values(this.context.state.drilledLayers),
			baseDepth,
		);
		this.context
			.controllers()
			.cameraMotion.transitionRegionCamera(nextTarget, nextZoom, returnPose);
		this.context.state.callbacks.onDrillChange?.(
			this.context.state.drillPath.map((item) => String(item.properties?.name)),
		);
	}
}

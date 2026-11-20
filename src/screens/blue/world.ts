import { Vector2 } from "three";
import type { FreightMode } from "./freight";
import WorldCamera from "./world/camera";
import CameraMotion from "./world/camera-motion";
import type { WorldControllers } from "./world/controller-types";
import WorldFrame from "./world/frame";
import WorldInteraction from "./world/interaction";
import RegionNavigation from "./world/regions";
import WorldResources from "./world/resources";
import WorldState from "./world/state";
import Subdivisions from "./world/subdivisions";
import type { BlueWorldCallbacks, Layer, View } from "./world/types";
import WorldView from "./world/view";

export type { MonitoringPoint } from "./world/types";

/** Assembles the scene controllers and exposes the screen's stable API. */
export default class BlueWorld {
	private readonly state: WorldState;
	private readonly controllers: WorldControllers;

	constructor(canvas: HTMLCanvasElement, callbacks: BlueWorldCallbacks = {}) {
		this.state = new WorldState(canvas, callbacks, () => this.controllers);
		const context = { state: this.state, controllers: () => this.controllers };
		this.controllers = {
			camera: new WorldCamera(context),
			cameraMotion: new CameraMotion(context),
			view: new WorldView(context),
			regions: new RegionNavigation(context),
			subdivisions: new Subdivisions(context),
			interaction: new WorldInteraction(context),
			frame: new WorldFrame(context),
			resources: new WorldResources(context),
		};
		this.state.resizeObserver.observe(canvas.parentElement ?? canvas);
		this.controllers.camera.resize();
		window.addEventListener("resize", this.controllers.camera.resize);
		canvas.addEventListener(
			"pointermove",
			this.controllers.interaction.onPointerMove,
		);
		canvas.addEventListener(
			"pointerdown",
			this.controllers.interaction.onPointerDown,
		);
		canvas.addEventListener(
			"pointerup",
			this.controllers.interaction.onPointerUp,
		);
		canvas.addEventListener(
			"pointerleave",
			this.controllers.interaction.onPointerLeave,
		);
		canvas.addEventListener("wheel", this.controllers.interaction.onWheel, {
			passive: false,
		});
		this.controllers.frame.animate();
		void this.controllers.resources.load();
	}

	closeMonitoringPoint() {
		return this.controllers.interaction.closeMonitoringPoint();
	}

	setLayer(layer: Layer, enabled: boolean) {
		return this.controllers.view.setLayer(layer, enabled);
	}

	setFreightMode(mode: FreightMode, enabled: boolean) {
		return this.controllers.view.setFreightMode(mode, enabled);
	}

	setView(view: View) {
		return this.controllers.view.setView(view);
	}

	zoom(factor: number) {
		return this.controllers.camera.zoom(factor);
	}

	reset() {
		return this.controllers.view.reset();
	}

	goBack() {
		return this.controllers.regions.goBack();
	}

	setTopView() {
		return this.controllers.camera.setTopView();
	}

	drilldown(name: string | number) {
		return this.controllers.regions.drilldown(name);
	}

	destroy() {
		return this.controllers.resources.destroy();
	}

	getState() {
		return {
			view: this.state.view,
			region: this.state.selectedRegion ?? "",
			regionPath: this.state.drillPath.map((feature) =>
				String(feature.properties?.name),
			),
			regionCodes: this.state.drillPath.map((feature) =>
				Number(feature.properties?.adcode),
			),
			detailLoading: this.state.detailLoading,
			canDrill: this.state.detailMeshes.map((mesh) => ({
				name: mesh.userData.name,
				adcode: mesh.userData.feature.properties.adcode,
			})),
			freight: this.state.globeScene.freight?.getState(),
			zoom: this.state.zoomLevel,
			topView: this.state.topView,
			rotation: this.state.mapRotation,
			ready: this.state.ready,
			chinaLoaded: this.state.chinaReady,
			loadingView: this.state.loadingView,
			mapLabelOpacity: this.state.mapLabelOpacity,
			renderSize: this.state.renderer.getSize(new Vector2()).toArray(),
			drawCalls: this.state.renderer.info.render.calls,
			requestedView: this.state.requestedView,
			resetScope: this.state.selectedRegion ?? this.state.view,
			viewTransitioning: this.state.switchingView,
			viewEntering: this.state.viewEntranceActive,
			cloudProgress: this.state.cloudTransition.progress.value,
			viewMix: this.state.viewMix,
			frameOpacity: this.state.regionGeometry.current
				? 1 - this.state.regionGeometry.current.progress
				: 0,
			transitionTextureBytes: 0,
			globeRotation: this.state.globeScene.mesh?.rotation.toArray().slice(0, 3),
			cameraPosition: this.state.camera.position.toArray(),
			transitioning:
				this.state.switchingView ||
				this.state.regionGeometry.current !== undefined ||
				(this.state.transitionTimeline?.isActive() ?? false) ||
				(this.state.zoomTween?.isActive() ?? false) ||
				(this.state.angleTween?.isActive() ?? false),
			layers: { ...this.state.layerEnabled },
			globeLayers: Object.fromEntries(
				Object.entries(this.state.globeScene.layers).map(([name, group]) => [
					name,
					{ visible: group.visible, objects: group.children.length },
				]),
			),
			subdivisionLabels: this.state.drilledLabels?.children.length ?? 0,
			visibleMonitoringPoints: this.state.chinaScene.monitoringMarkers.filter(
				(marker) => this.controllers.interaction.isVisible(marker),
			).length,
		};
	}
}

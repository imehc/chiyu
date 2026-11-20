import gsap from "gsap";
import { type Object3D, Vector3 } from "three";
import type { FreightMode } from "../freight";
import { CHINA_GLOBE_FOCUS, GLOBE_HOME } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { Layer, View } from "./types";

interface WorldViewContext {
	state: Pick<
		WorldState,
		| "callbacks"
		| "camera"
		| "cameraPitch"
		| "cameraYaw"
		| "chinaLoadPromise"
		| "chinaReady"
		| "chinaScene"
		| "cloudTransition"
		| "composer"
		| "destroyed"
		| "detailHomeTarget"
		| "detailLoading"
		| "detailTimeline"
		| "detailZoom"
		| "drilledLayers"
		| "globeLabelOpacity"
		| "globeScene"
		| "labelTween"
		| "layerEnabled"
		| "layerMotion"
		| "loadingView"
		| "mapEffects"
		| "mapLabelOpacity"
		| "mapRotation"
		| "mapRotationCenter"
		| "ready"
		| "reducedMotion"
		| "regionGeometry"
		| "regionRequest"
		| "renderer"
		| "requestedView"
		| "selectedRegion"
		| "switchingView"
		| "target"
		| "topView"
		| "transitionTimeline"
		| "view"
		| "viewLoadRequest"
		| "viewMix"
		| "viewTimeline"
		| "zoomLevel"
	>;
	controllers: () => Pick<
		WorldControllers,
		| "camera"
		| "cameraMotion"
		| "frame"
		| "interaction"
		| "regions"
		| "resources"
	>;
}

export default class WorldView {
	constructor(private readonly context: WorldViewContext) {}

	setLayer(layer: Layer, enabled: boolean) {
		this.context.state.layerEnabled[layer] = enabled;
		const objects = new Set<Object3D>([
			this.context.state.chinaScene.layers[layer],
			this.context.state.globeScene.layers[layer],
		]);
		if (this.context.state.drilledLayers[layer])
			objects.add(this.context.state.drilledLayers[layer]!);
		if (layer === "scan" && this.context.state.globeScene.floatingRing)
			objects.add(this.context.state.globeScene.floatingRing);
		for (const root of this.context.state.regionGeometry.current?.outgoing ??
			[]) {
			root.traverse((object) => {
				if (object.userData.blueLayer === layer) objects.add(object);
			});
		}
		for (const object of objects) {
			object.userData.blueLayer = layer;
			this.context.state.layerMotion.setVisible(
				object,
				enabled,
				this.context.state.reducedMotion.matches,
			);
		}
		this.context.controllers().interaction.updateMonitoringPoint();
	}

	setFreightMode(mode: FreightMode, enabled: boolean) {
		this.context.state.globeScene.freight?.setMode(mode, enabled);
	}

	applyView(view: View) {
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.controllers().regions.clearSubdivisions();
		this.context.state.view = view;
		this.context.state.viewMix = view === "globe" ? 1 : 0;
		this.context.state.globeLabelOpacity = view === "globe" ? 1 : 0;
		this.context.state.mapLabelOpacity = 0;
		this.context.state.zoomLevel = 1;
		this.context.state.topView = false;
		this.context.state.cameraPitch = 0.72;
		this.context.state.cameraYaw = 0;
		this.context.state.mapRotation = 0;
		this.context.state.mapRotationCenter.set(0, 0);
		this.context.controllers().camera.updateMapRotation();
		this.context.state.target.set(
			view === "china" ? 0.35 : 0,
			view === "globe" ? 0.25 : 0,
			0,
		);
		this.context.state.chinaScene.root.visible = view === "china";
		this.context.state.chinaScene.root.position.set(0, 0, 0);
		this.context.state.chinaScene.root.scale.setScalar(1);
		this.context.state.chinaScene.map.visible =
			this.context.state.chinaScene.labels.visible =
			this.context.state.chinaScene.background.visible =
			this.context.state.chinaScene.orbitRing.visible =
				true;
		this.context.state.globeScene.root.visible =
			this.context.state.globeScene.effects.visible = view === "globe";
		if (this.context.state.globeScene.mesh)
			this.context.state.globeScene.mesh.rotation.set(
				GLOBE_HOME.x,
				GLOBE_HOME.y,
				GLOBE_HOME.z,
			);
		this.context.controllers().camera.updateCamera();
	}

	stopViewTransition(notify = true) {
		this.context.state.viewTimeline?.kill();
		this.context.state.viewTimeline = undefined;
		this.context.state.switchingView = false;
		this.context.state.cloudTransition.clear();
		if (notify) this.context.state.callbacks.onTransitionChange?.(false);
	}

	setView(view: View) {
		if (this.context.state.destroyed) return;
		if (view !== this.context.state.view) {
			this.context.state.regionRequest++;
			this.context.state.detailLoading = false;
			this.context.state.regionGeometry.finish();
		}
		if (view !== this.context.state.view || this.context.state.switchingView)
			this.context.controllers().cameraMotion.stopCameraControls();
		if (!this.context.state.ready) {
			this.context.state.requestedView = view;
			return;
		}
		if (view === "china" && !this.context.state.chinaReady) {
			if (
				this.context.state.loadingView &&
				this.context.state.requestedView === view
			)
				return;
			const request = ++this.context.state.viewLoadRequest;
			this.context.state.requestedView = view;
			this.context.state.loadingView = this.context.state.switchingView = true;
			this.context.state.callbacks.onTransitionChange?.(true);
			this.context.state.callbacks.onViewMotionChange?.("exit");
			void this.context
				.controllers()
				.resources.ensureChina()
				.then(() => {
					if (
						this.context.state.destroyed ||
						request !== this.context.state.viewLoadRequest
					)
						return;
					this.context.state.loadingView = false;
					this.stopViewTransition(false);
					this.setView("china");
				})
				.catch((error) => {
					if (
						this.context.state.destroyed ||
						request !== this.context.state.viewLoadRequest
					)
						return;
					console.error("中国地图加载失败", error);
					this.context.state.chinaLoadPromise = undefined;
					this.context.state.loadingView = false;
					this.context.state.requestedView = this.context.state.view;
					this.stopViewTransition();
					this.context.state.callbacks.onViewMotionChange?.("idle");
				});
			return;
		}
		if (this.context.state.loadingView) {
			this.context.state.viewLoadRequest++;
			this.context.state.loadingView = false;
			this.context.state.requestedView = view;
			this.stopViewTransition();
			this.context.state.callbacks.onViewMotionChange?.("idle");
		}
		if (
			this.context.state.switchingView &&
			this.context.state.requestedView === view
		)
			return;
		if (!this.context.state.switchingView && this.context.state.view === view)
			return;
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.detailTimeline?.kill();
		this.context.state.labelTween?.kill();
		this.context.state.regionGeometry.finish();
		this.stopViewTransition(false);
		this.context.state.requestedView = view;
		if (this.context.state.reducedMotion.matches) {
			this.applyView(view);
			this.context.state.callbacks.onViewChange?.(view);
			this.context.state.callbacks.onTransitionChange?.(false);
			this.context.state.callbacks.onViewMotionChange?.("idle");
			this.context.controllers().frame.revealMapNames();
			return;
		}
		this.context.state.switchingView = true;
		this.context.state.callbacks.onTransitionChange?.(true);
		this.context.state.callbacks.onViewMotionChange?.("exit");
		// Keep the globe at its current size and pass the cloud bank on one clock.
		this.context.state.viewTimeline = gsap.timeline({
			onComplete: () => {
				this.stopViewTransition();
				this.context.state.callbacks.onViewMotionChange?.("enter");
				if (view === "china")
					this.context.state.mapEffects.restartEntrance(0.15);
				this.context.state.transitionTimeline?.play(0);
			},
		});
		if (this.context.state.view === "globe") {
			if (this.context.state.globeScene.mesh) {
				const turn = Math.PI * 2;
				this.context.state.globeScene.mesh.rotation.y =
					CHINA_GLOBE_FOCUS.y +
					((((this.context.state.globeScene.mesh.rotation.y -
						CHINA_GLOBE_FOCUS.y +
						Math.PI) %
						turn) +
						turn) %
						turn) -
					Math.PI;
				this.context.state.viewTimeline.to(
					this.context.state.globeScene.mesh.rotation,
					{ ...CHINA_GLOBE_FOCUS, duration: 1.25, ease: "power2.inOut" },
					0,
				);
			}
			this.context.state.viewTimeline.to(
				this.context.state,
				{
					globeLabelOpacity: 0.2,
					duration: 1.25,
					ease: "power2.inOut",
				},
				0,
			);
		} else {
			const dolly = { distance: 1 / this.context.state.zoomLevel };
			this.context.state.viewTimeline.to(
				dolly,
				{
					distance: 1,
					duration: 1.25,
					ease: "power2.inOut",
					onUpdate: () => {
						this.context.state.zoomLevel = 1 / dolly.distance;
						this.context.controllers().camera.updateCamera();
					},
				},
				0,
			);
			this.context.state.viewTimeline.to(
				this.context.state.target,
				{
					x: 0.35,
					y: 0,
					z: 0,
					duration: 1.25,
					ease: "power2.inOut",
					onUpdate: () => this.context.controllers().camera.updateCamera(),
				},
				0,
			);
			this.context.state.viewTimeline.to(
				this.context.state,
				{
					mapRotation: 0,
					mapLabelOpacity: 0.2,
					duration: 1.25,
					ease: "power2.inOut",
					onUpdate: () => {
						this.context.controllers().camera.updateMapRotation();
						this.context.controllers().camera.updateCamera();
					},
				},
				0,
			);
		}
		this.context.state.viewTimeline.to(
			this.context.state.cloudTransition.progress,
			{ value: 1, duration: 3.2, ease: "none" },
			0.9,
		);
		this.context.state.viewTimeline.call(
			() => {
				this.applyView(view);
				this.context.state.callbacks.onViewChange?.(view);
				this.context.controllers().cameraMotion.prepareViewEntrance(view);
				if (view === "china")
					this.context.state.mapEffects.restartEntrance(1.75);
				// The cloud center is fully opaque at the style handoff.
				this.context.state.composer.render();
				this.context.state.cloudTransition.render(
					this.context.state.renderer,
					this.context.state.camera,
				);
			},
			[],
			2.5,
		);
	}

	reset() {
		if (this.context.state.destroyed || !this.context.state.ready) return;
		if (this.context.state.regionGeometry.current) return;
		this.context.state.regionRequest++;
		this.context.state.detailLoading = false;
		if (this.context.state.loadingView) {
			this.context.state.viewLoadRequest++;
			this.context.state.loadingView = false;
			this.context.state.requestedView = this.context.state.view;
			this.stopViewTransition();
			this.context.state.callbacks.onViewMotionChange?.("idle");
		}
		if (this.context.state.switchingView)
			this.context.state.viewTimeline?.progress(1);

		this.context.state.topView = false;
		const target = this.context.state.selectedRegion
			? this.context.state.detailHomeTarget.clone()
			: new Vector3(
					this.context.state.view === "china" ? 0.35 : 0,
					this.context.state.view === "globe" ? 0.25 : 0,
					0,
				);
		this.context
			.controllers()
			.cameraMotion.transitionCamera(
				target,
				this.context.state.selectedRegion ? this.context.state.detailZoom : 1,
				1.15,
			);
		this.context.state.transitionTimeline?.to(
			this.context.state,
			{
				cameraPitch: 0.72,
				duration: this.context.state.reducedMotion.matches ? 0 : 1.15,
				ease: "power2.inOut",
				onUpdate: () => this.context.controllers().camera.updateCamera(),
			},
			0,
		);
		if (
			this.context.state.view === "globe" &&
			this.context.state.globeScene.mesh
		) {
			const fullTurn = Math.PI * 2;
			this.context.state.globeScene.mesh.rotation.y =
				GLOBE_HOME.y +
				((((this.context.state.globeScene.mesh.rotation.y -
					GLOBE_HOME.y +
					Math.PI) %
					fullTurn) +
					fullTurn) %
					fullTurn) -
				Math.PI;
			this.context.state.transitionTimeline?.to(
				this.context.state.globeScene.mesh.rotation,
				{
					...GLOBE_HOME,
					duration: this.context.state.reducedMotion.matches ? 0 : 1.15,
					ease: "power2.inOut",
				},
				0,
			);
		}
	}
}

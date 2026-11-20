import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import gsap from "gsap";
import {
	type BufferGeometry,
	type Group,
	Line,
	type LineBasicMaterial,
	Mesh,
	type MeshBasicMaterial,
	type PlaneGeometry,
	Points,
	type PointsMaterial,
	RepeatWrapping,
	ShaderMaterial,
	Sprite,
	type SpriteMaterial,
	SRGBColorSpace,
	TextureLoader,
	WebGLRenderTarget,
} from "three";
import { GLOBE_HOME } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";

interface WorldResourcesContext {
	state: Pick<
		WorldState,
		| "abortController"
		| "animationFrame"
		| "callbacks"
		| "camera"
		| "canvas"
		| "chinaData"
		| "chinaLoadPromise"
		| "chinaOutline"
		| "chinaReady"
		| "chinaScene"
		| "cloudTransition"
		| "composer"
		| "destroyed"
		| "detailTimeline"
		| "geometry"
		| "globeScene"
		| "labelTween"
		| "layerMotion"
		| "mapEffects"
		| "mapLabels"
		| "overlays"
		| "ready"
		| "regionGeometry"
		| "renderer"
		| "requestedView"
		| "resizeObserver"
		| "scene"
		| "target"
		| "textures"
		| "transitionTimeline"
		| "view"
		| "viewTimeline"
		| "zoomLevel"
	>;
	controllers: () => Pick<
		WorldControllers,
		"camera" | "cameraMotion" | "interaction" | "view"
	>;
}

export default class WorldResources {
	constructor(private readonly context: WorldResourcesContext) {}

	async readMap(name: string) {
		const response = await fetch(`/geojson/${name}`, {
			signal: this.context.state.abortController.signal,
		});
		if (!response.ok) throw new Error(`地图资源读取失败: ${name}`);
		return (await response.json()) as FeatureCollection<Polygon | MultiPolygon>;
	}

	async load() {
		try {
			const [china, outline, world] = await Promise.all([
				this.readMap("blue/100000.json"),
				this.readMap("blue/100000-outline.json"),
				this.readMap("world.json"),
			]);
			if (this.context.state.destroyed) return;
			this.context.state.chinaData = china;
			this.context.state.chinaOutline = outline;
			await this.context.state.globeScene.create(
				world,
				china,
				outline,
				this.context.state.renderer,
				() => this.context.state.destroyed,
			);
			if (this.context.state.destroyed) return;
			this.context.state.ready = true;
			if (this.context.state.requestedView === "china")
				await this.ensureChina();
			if (this.context.state.destroyed) return;
			if (!this.context.state.chinaReady) this.warmViews();
			this.context.controllers().camera.resize();
			this.context
				.controllers()
				.view.applyView(this.context.state.requestedView);
			if (this.context.state.view === "china") {
				this.context.controllers().cameraMotion.playChinaEntrance();
			} else {
				this.context.state.zoomLevel = 0.72;
				if (this.context.state.globeScene.mesh)
					this.context.state.globeScene.mesh.rotation.y = GLOBE_HOME.y - 0.5;
				this.context.controllers().camera.updateCamera();
				this.context
					.controllers()
					.cameraMotion.transitionCamera(
						this.context.state.target.clone(),
						1,
						2.4,
						0.25,
					);
				if (this.context.state.globeScene.mesh)
					this.context.state.transitionTimeline?.to(
						this.context.state.globeScene.mesh.rotation,
						{ ...GLOBE_HOME, duration: 2.4, ease: "power2.out" },
						0,
					);
			}
			this.context.state.callbacks.onViewChange?.(this.context.state.view);
			this.context.state.callbacks.onReady?.();
		} catch (error) {
			if (!this.context.state.destroyed) {
				console.error("蓝色大屏地图加载失败", error);
				this.context.state.callbacks.onReady?.();
			}
		}
	}

	ensureChina() {
		if (this.context.state.chinaLoadPromise)
			return this.context.state.chinaLoadPromise;
		this.context.state.chinaLoadPromise = (async () => {
			const china = this.context.state.chinaData,
				outline = this.context.state.chinaOutline;
			if (!china || !outline) throw new Error("中国地图基础轮廓尚未加载");
			const [countriesResult, sideResult, effectsResult] =
				await Promise.allSettled([
					this.readMap("世界-周边.json"),
					new TextureLoader().loadAsync("/texture/side.png"),
					this.context.state.mapEffects.load(),
				]);
			if (sideResult.status === "rejected") throw sideResult.reason;
			const side = sideResult.value;
			if (countriesResult.status === "rejected") {
				side.dispose();
				throw countriesResult.reason;
			}
			if (effectsResult.status === "rejected") {
				side.dispose();
				throw effectsResult.reason;
			}
			const countries = countriesResult.value;
			if (this.context.state.destroyed) {
				side.dispose();
				return;
			}
			side.colorSpace = SRGBColorSpace;
			side.wrapS = side.wrapT = RepeatWrapping;
			this.context.state.geometry.sideTexture = side;
			this.context.state.textures.disposable.add(side);
			for (const texture of this.context.state.mapEffects.sharedTextures)
				this.context.state.textures.shared.add(texture);
			this.context.state.chinaScene.map.add(
				this.context.state.mapEffects.group,
			);
			this.context.state.chinaScene.createSurrounding(countries);
			this.context.state.chinaScene.createChina(china, outline);
			this.context.state.chinaScene.createCityMarkers();
			this.context.state.chinaScene.createScatter();
			this.context.state.chinaScene.createHeat();
			this.context.state.chinaScene.createFlylines();
			this.warmViews();
			this.context.state.chinaReady = true;
		})();
		return this.context.state.chinaLoadPromise;
	}

	warmViews() {
		// First-use uploads and shader compilation belong in loading, not the cloud wipe.
		const warmScene = this.context.state.scene.clone();
		warmScene.traverse((object) => {
			object.visible = true;
		});
		const previous = this.context.state.renderer.getRenderTarget();
		const target = new WebGLRenderTarget(1, 1);
		try {
			this.context.state.renderer.setRenderTarget(target);
			this.context.state.renderer.compile(warmScene, this.context.state.camera);
			for (const texture of new Set([
				...this.context.state.textures.disposable,
				...this.context.state.textures.shared,
			]))
				this.context.state.renderer.initTexture(texture);
			this.context.state.renderer.render(warmScene, this.context.state.camera);
			this.context.state.cloudTransition.progress.value = 0.5;
			this.context.state.cloudTransition.render(
				this.context.state.renderer,
				this.context.state.camera,
			);
		} finally {
			this.context.state.cloudTransition.clear();
			this.context.state.renderer.setRenderTarget(previous);
			target.dispose();
			warmScene.clear();
		}
	}

	disposeObject(root: Group | Mesh | import("three").Object3D) {
		this.context.state.layerMotion.forget(root);
		this.context.state.regionGeometry.reveal.forget(root);
		this.context.state.mapEffects.forget(root);
		root.traverse((child) => {
			const surfaceLabelIndex =
				this.context.state.mapLabels.surfaceLabels.indexOf(
					child as Mesh<PlaneGeometry, MeshBasicMaterial>,
				);
			if (surfaceLabelIndex >= 0)
				this.context.state.mapLabels.surfaceLabels.splice(surfaceLabelIndex, 1);
			gsap.killTweensOf(child.scale);
			for (
				let index = this.context.state.overlays.alertAnimations.length - 1;
				index >= 0;
				index--
			) {
				if (this.context.state.overlays.alertAnimations[index].point === child)
					this.context.state.overlays.alertAnimations.splice(index, 1);
			}

			if (child instanceof Sprite) {
				const texture = child.material.map;
				if (texture && !this.context.state.textures.shared.has(texture)) {
					texture.dispose();
					this.context.state.textures.disposable.delete(texture);
				}
				child.material.dispose();
				const index =
					this.context.state.chinaScene.monitoringMarkers.indexOf(child);
				if (index >= 0)
					this.context.state.chinaScene.monitoringMarkers.splice(index, 1);
			}
			if (
				child instanceof Mesh ||
				child instanceof Line ||
				child instanceof Points
			) {
				child.geometry.dispose();
				const materials = Array.isArray(child.material)
					? child.material
					: [child.material];
				materials.forEach((material) => {
					const texture = (material as MeshBasicMaterial).map;
					if (texture && !this.context.state.textures.shared.has(texture)) {
						texture.dispose();
						this.context.state.textures.disposable.delete(texture);
					}
					if (material instanceof ShaderMaterial) {
						this.context.state.geometry.sideMaterials.delete(material);
						if (material.uniforms.hovered)
							gsap.killTweensOf(material.uniforms.hovered);
					}
					material.dispose();
				});
			}
		});
	}

	destroy() {
		this.context.state.destroyed = true;
		this.context.state.regionGeometry.finish();
		this.context.state.layerMotion.dispose();
		this.context.state.regionGeometry.reveal.dispose();
		this.context.state.cloudTransition.dispose();
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.viewTimeline?.kill();
		this.context.state.transitionTimeline?.kill();
		this.context.state.detailTimeline?.kill();
		this.context.state.labelTween?.kill();
		this.context.state.mapEffects.dispose();
		this.context.state.mapLabels.surfaceLabels.length = 0;
		this.context.state.globeScene.freight?.dispose();
		this.context.state.abortController.abort();
		cancelAnimationFrame(this.context.state.animationFrame);
		this.context.state.resizeObserver.disconnect();
		window.removeEventListener(
			"resize",
			this.context.controllers().camera.resize,
		);
		this.context.state.canvas.removeEventListener(
			"pointermove",
			this.context.controllers().interaction.onPointerMove,
		);
		this.context.state.canvas.removeEventListener(
			"pointerdown",
			this.context.controllers().interaction.onPointerDown,
		);
		this.context.state.canvas.removeEventListener(
			"pointerup",
			this.context.controllers().interaction.onPointerUp,
		);
		this.context.state.canvas.removeEventListener(
			"pointerleave",
			this.context.controllers().interaction.onPointerLeave,
		);
		this.context.state.canvas.removeEventListener(
			"wheel",
			this.context.controllers().interaction.onWheel,
		);
		this.context.state.canvas.style.cursor = "default";
		const geometries = new Set<BufferGeometry>();
		const materials = new Set<
			| MeshBasicMaterial
			| ShaderMaterial
			| LineBasicMaterial
			| SpriteMaterial
			| PointsMaterial
		>();
		const collect = (object: import("three").Object3D) => {
			if (
				object instanceof Mesh ||
				object instanceof Line ||
				object instanceof Points ||
				object instanceof Sprite
			) {
				if ("geometry" in object) geometries.add(object.geometry);
				const list = Array.isArray(object.material)
					? object.material
					: [object.material];
				list.forEach((material) => {
					materials.add(material as MeshBasicMaterial);
				});
			}
		};
		this.context.state.scene.traverse(collect);
		Object.values(this.context.state.chinaScene.layers).forEach((layer) => {
			layer.traverse(collect);
		});
		geometries.forEach((geometry) => {
			geometry.dispose();
		});
		materials.forEach((material) => {
			if (material instanceof ShaderMaterial && material.uniforms.hovered)
				gsap.killTweensOf(material.uniforms.hovered);
			material.dispose();
		});
		this.context.state.textures.disposable.forEach((texture) => {
			texture.dispose();
		});
		this.context.state.composer.passes.forEach((pass) => {
			pass.dispose();
		});
		this.context.state.composer.dispose();
		this.context.state.renderer.dispose();
		this.context.state.renderer.forceContextLoss();
	}
}

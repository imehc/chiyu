/**
 * 资源与生命周期：加载 GeoJSON 与贴图、构建中国/地球场景、预热 shader 与纹理，
 * 以及销毁时统一释放几何、材质、纹理与渲染器。
 * 由 BlueWorld 在构造末尾以 fire-and-forget 方式启动 load，destroy 再由 BlueWorld.destroy 转发；
 * 所有异步步骤都以 state.destroyed 与 abortController 作为取消依据。
 */
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

/**
 * 资源控制器所需的状态切片与控制器访问器。
 * 只声明本文件读写的字段；controllers 惰性取值，构造期控制器尚未全部就绪。
 */
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

/**
 * 资源加载与销毁控制器。
 * 加载过程是幂等且可取消的：重复调用 ensureChina 复用同一个 Promise，
 * 卸载时 abort 请求并置 destroyed，任何 await 之后都能安全提前返回。
 */
export default class WorldResources {
	constructor(private readonly context: WorldResourcesContext) {}

	/**
	 * 读取并解析一份 GeoJSON，请求统一挂载 abortController 的取消信号。
	 * 销毁时 abort 会让 fetch 直接 reject，调用方需按「已销毁」处理而不是当错误上报。
	 * @param name 相对 public/geojson 的路径，如 blue/100000.json
	 * @returns 标准 GeoJSON FeatureCollection
	 */
	async readMap(name: string) {
		// public 资源跟随 Vite 的部署基路径，兼容根目录与子目录预览。
		const response = await fetch(`${import.meta.env.BASE_URL}geojson/${name}`, {
			signal: this.context.state.abortController.signal,
		});
		if (!response.ok) throw new Error(`地图资源读取失败: ${name}`);
		return (await response.json()) as FeatureCollection<Polygon | MultiPolygon>;
	}

	/**
	 * 首屏加载主流程：并行取全国、国界与世界数据，先建地球场景、再按需构建中国地图，
	 * 最后套用用户请求的视图并播放入场动画。
	 * 每个 await 之后都要重新检查 destroyed：组件可能在网络往返期间被卸载。
	 */
	async load() {
		try {
			// 三份数据互不依赖，用 Promise.all 并发，任一失败都进入 catch
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
			// 用户请求的是中国视图时，先确保几何就绪，否则入场动画没有对象可播放
			if (this.context.state.requestedView === "china")
				await this.ensureChina();
			if (this.context.state.destroyed) return;
			// 中国地图尚未构建（从地球视图起步）时预热一次，把首帧编译开销提前到加载阶段
			if (!this.context.state.chinaReady) this.warmViews();
			this.context.controllers().camera.resize();
			this.context
				.controllers()
				.view.applyView(this.context.state.requestedView);
			if (this.context.state.view === "china") {
				this.context.controllers().cameraMotion.playChinaEntrance();
			} else {
				// 地球视图：先拉远，再用 transitionCamera 推近，同时把球体转回归位姿态
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
			// 销毁导致的 abort 不算失败；其它错误记日志后仍要回调 onReady，
			// 让外层撤掉 loading 遮罩，避免界面永久卡住
			if (!this.context.state.destroyed) {
				console.error("蓝色大屏地图加载失败", error);
				this.context.state.callbacks.onReady?.();
			}
		}
	}

	/**
	 * 构建中国地图场景，多次调用复用同一个 Promise，防止并发重复建几何。
	 * 周边国家数据、侧面贴图与地图特效并行加载；采用 allSettled 是为了在部分失败时
	 * 仍能释放已成功申请的纹理，避免重试不断累积 GPU 资源。
	 * @returns 构建完成的 Promise，失败时 reject 原始错误
	 */
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
			// 侧面贴图几乎占满整个立体块的表面，缺了它地图无法成形，优先判定
			if (sideResult.status === "rejected") throw sideResult.reason;
			const side = sideResult.value;
			// 后续任一失败都要先 dispose 已加载的贴图，否则重试会不断泄漏 GPU 纹理
			if (countriesResult.status === "rejected") {
				side.dispose();
				throw countriesResult.reason;
			}
			if (effectsResult.status === "rejected") {
				side.dispose();
				throw effectsResult.reason;
			}
			const countries = countriesResult.value;
			// 加载期间可能已被销毁：此时不要再往场景里塞对象，直接释放贴图退出
			if (this.context.state.destroyed) {
				side.dispose();
				return;
			}
			side.colorSpace = SRGBColorSpace;
			// 侧面贴图沿 UV 平铺，两个方向都需要 RepeatWrapping 才不会拉花
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

	/**
	 * 预热：克隆一份全可见的场景，在 1×1 的离屏目标上编译 shader、上传纹理并渲染一次，
	 * 把首次切换视图时的卡顿提前到加载阶段发生。
	 * 结束后恢复原渲染目标并释放临时资源，避免污染正式画面。
	 */
	warmViews() {
		// 首次使用的纹理上传与 shader 编译应该发生在加载阶段，而不是云层擦除动画里
		const warmScene = this.context.state.scene.clone();
		// clone 只复制节点结构，材质与几何仍共享，因此预热不会额外占显存
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
			// 云层推进到一半再擦除一次，触发完整的擦除 shader 编译
			this.context.state.cloudTransition.progress.value = 0.5;
			this.context.state.cloudTransition.render(
				this.context.state.renderer,
				this.context.state.camera,
			);
		} finally {
			// finally 保证即使 compile 抛错也会还原渲染目标并释放临时目标
			this.context.state.cloudTransition.clear();
			this.context.state.renderer.setRenderTarget(previous);
			target.dispose();
			warmScene.clear();
		}
	}

	/**
	 * 释放一棵子树：先从各动画管理器注销，再逐个释放纹理、材质与几何。
	 * 共享纹理不销毁，只释放本对象独占的贴图，避免误伤其它图层共用的资源。
	 * @param root 待释放的子树的根节点
	 */
	disposeObject(root: Group | Mesh | import("three").Object3D) {
		this.context.state.layerMotion.forget(root);
		this.context.state.regionGeometry.reveal.forget(root);
		this.context.state.mapEffects.forget(root);
		root.traverse((child) => {
			// 从表面标签列表摘除，否则后续 updateMapNames 会访问已销毁的材质
			const surfaceLabelIndex =
				this.context.state.mapLabels.surfaceLabels.indexOf(
					child as Mesh<PlaneGeometry, MeshBasicMaterial>,
				);
			if (surfaceLabelIndex >= 0)
				this.context.state.mapLabels.surfaceLabels.splice(surfaceLabelIndex, 1);
			// 停掉该对象 scale 上的补间，防止动画继续写入已释放的对象
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
				// 不在共享集合里说明是本对象生成的贴图，需要一并释放
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
						// 侧面材质集合被逐帧遍历，残留已销毁的材质会在下一帧抛错
						this.context.state.geometry.sideMaterials.delete(material);
						if (material.uniforms.hovered)
							gsap.killTweensOf(material.uniforms.hovered);
					}
					material.dispose();
				});
			}
		});
	}

	/**
	 * 彻底销毁：停掉所有补间与渲染循环、解绑事件、释放几何/材质/纹理与渲染器。
	 * 顺序上先置 destroyed 再拆资源，让在途的异步回调与逐帧逻辑提前返回；
	 * abortController.abort 会取消尚未完成的 GeoJSON 请求。
	 */
	destroy() {
		// 先置标记：此后所有 await 之后的检查都会直接 return，不会访问半释放的对象
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
		// 取消动画帧，避免销毁后继续渲染已释放的场景
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
		// 用 Set 去重：同一几何/材质常被多个对象共享，重复 dispose 会打断仍在使用的资源
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
		// 业务图层可能挂在 chinaScene.layers 而不是主场景上，需要单独遍历一遍
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
		// 主动丢弃 WebGL 上下文：浏览器对同时存在的上下文数量有上限，释放后切页才不会丢帧
		this.context.state.renderer.forceContextLoss();
	}
}

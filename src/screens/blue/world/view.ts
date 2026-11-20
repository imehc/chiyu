/**
 * 视图控制：在中国平面视图与全球视图之间切换，并维护图层开关到场景对象的映射。
 * 切换采用「云层擦除」：时间线先让旧视图退场，云层铺满屏幕后一次性替换可见性，
 * 再播放新视图的入场，避免两套场景硬切。
 * 由 BlueWorld 的 view 控制器对外暴露（setView / setLayer / reset）；
 * 下钻进入与返回也会调用 applyView("china") 复用它做无动画归位。
 */
import gsap from "gsap";
import { type Object3D, Vector3 } from "three";
import type { FreightMode } from "../freight";
import { CHINA_GLOBE_FOCUS, GLOBE_HOME } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { Layer, View } from "./types";

/**
 * 视图切换所需的上下文切片：只列出本类读写的 WorldState 字段，
 * 以及真正会调用的控制器，构造整体状态依赖。
 */
interface WorldViewContext {
	/** 视图、相机、时间线与图层开关等共享状态，字段含义见 WorldState 对应成员 */
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
	/** 延迟取控制器：构造期控制器尚未建成，只能在方法执行时再调用，避免循环依赖 */
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

/**
 * 世界视图控制器。
 * 只改写视图相关字段与两套场景的可见性，不持有几何；
 * 相机运动交给 camera / cameraMotion，行政区清理交给 regions。
 */
export default class WorldView {
	constructor(private readonly context: WorldViewContext) {}

	/**
	 * 开关某个业务图层。
	 * 同一个 layer 最多对应三处对象：中国视图的 chinaScene.layers、全球视图的 globeScene.layers，
	 * 下钻时还有 drilledLayers；scan 额外联动地球的悬浮光环。
	 * 这几处必须同步，否则切换视图或下钻后会出现「开关关了但元素仍在」。
	 * @param layer 图层标识，key 与 layerEnabled 一致
	 * @param enabled 目标显隐状态
	 */
	setLayer(layer: Layer, enabled: boolean) {
		this.context.state.layerEnabled[layer] = enabled;
		// 用 Set 去重：下钻层的容器可能同时被 drilledLayers 与 outgoing 遍历命中
		const objects = new Set<Object3D>([
			this.context.state.chinaScene.layers[layer],
			this.context.state.globeScene.layers[layer],
		]);
		if (this.context.state.drilledLayers[layer])
			objects.add(this.context.state.drilledLayers[layer]!);
		// 扫描图层的视觉主体在地球侧的浮环上，不在图层分组里
		if (layer === "scan" && this.context.state.globeScene.floatingRing)
			objects.add(this.context.state.globeScene.floatingRing);
		// 过渡中的旧几何已被移入 outgoing 分组，也要按 blueLayer 标记找到并同步开关
		for (const root of this.context.state.regionGeometry.current?.outgoing ??
			[]) {
			root.traverse((object) => {
				if (object.userData.blueLayer === layer) objects.add(object);
			});
		}
		for (const object of objects) {
			// 打标记：过渡收尾恢复可见性时靠它区分「图层对象」与普通装饰
			object.userData.blueLayer = layer;
			this.context.state.layerMotion.setVisible(
				object,
				enabled,
				this.context.state.reducedMotion.matches,
			);
		}
		// 信息点开关影响屏幕投影与监测点面板，关闭后需重新计算当前可见标记
		this.context.controllers().interaction.updateMonitoringPoint();
	}

	/**
	 * 转发货运模式开关。货运弧线只存在于地球场景，因此交给 globeScene.freight 处理；
	 * 数据尚未就绪时该字段为空，直接忽略。
	 */
	setFreightMode(mode: FreightMode, enabled: boolean) {
		this.context.state.globeScene.freight?.setMode(mode, enabled);
	}

	/**
	 * 立即切到目标视图，不播放任何过渡：清空下钻、复位相机与标签透明度、重建可见性。
	 * 它是过渡动画的「落位帧」，也是系统开启「减少动态效果」时的直通路径。
	 * @param view 目标视图
	 */
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
		// 构图偏移：两个视图的观察点不同（中国 x=0.35、地球 y=0.25），给侧边信息栏让出位置
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

	/**
	 * 中止视图切换：杀掉时间线、清除云层、解除 switchingView 锁定。
	 * @param notify 是否回调 onTransitionChange(false)；内部接续时传 false，避免 UI 状态抖动
	 */
	stopViewTransition(notify = true) {
		this.context.state.viewTimeline?.kill();
		this.context.state.viewTimeline = undefined;
		this.context.state.switchingView = false;
		this.context.state.cloudTransition.clear();
		if (notify) this.context.state.callbacks.onTransitionChange?.(false);
	}

	/**
	 * 切换到目标视图：需要时先加载中国地图，再用一条时间线完成「旧视图退场 → 云层擦除 → 新视图入场」。
	 * 重复点击由 switchingView / requestedView 去重；加载失败会把 requestedView 回滚到当前视图。
	 * @param view 目标视图，"china" 或 "globe"
	 */
	setView(view: View) {
		if (this.context.state.destroyed) return;
		if (view !== this.context.state.view) {
			// 视图确实要变：作废在途的下钻请求，并立即收尾未完成的边界过渡，
			// 否则旧几何会留在场景里，直到下一次下钻才被清理
			this.context.state.regionRequest++;
			this.context.state.detailLoading = false;
			this.context.state.regionGeometry.finish();
		}
		if (view !== this.context.state.view || this.context.state.switchingView)
			this.context.controllers().cameraMotion.stopCameraControls();
		if (!this.context.state.ready) {
			// 首屏资源未就绪：只记下意图，resources.load 完成后会按 requestedView 直接落位
			this.context.state.requestedView = view;
			return;
		}
		if (view === "china" && !this.context.state.chinaReady) {
			// 已经在为同一个目标加载：直接忽略重复点击
			if (
				this.context.state.loadingView &&
				this.context.state.requestedView === view
			)
				return;
			// 令牌用于丢弃过期的加载回调（期间可能又切回了地球）
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
					// 加载期间已由云层遮住屏幕，这里只需要收尾再走正常的切换流程
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
					// 释放失败的 Promise，允许下一次点击重新尝试
					this.context.state.chinaLoadPromise = undefined;
					this.context.state.loadingView = false;
					this.context.state.requestedView = this.context.state.view;
					this.stopViewTransition();
					this.context.state.callbacks.onViewMotionChange?.("idle");
				});
			return;
		}
		if (this.context.state.loadingView) {
			// 新的视图请求打断了正在进行的加载：作废加载令牌并解除过渡态
			this.context.state.viewLoadRequest++;
			this.context.state.loadingView = false;
			this.context.state.requestedView = view;
			this.stopViewTransition();
			this.context.state.callbacks.onViewMotionChange?.("idle");
		}
		// 已经在切向同一目标，或当前就是该视图且没有过渡在跑，无需重复启动
		if (
			this.context.state.switchingView &&
			this.context.state.requestedView === view
		)
			return;
		if (!this.context.state.switchingView && this.context.state.view === view)
			return;
		// 切换前统一收口：相机拖拽、缩放、下钻、标签补间全部停掉，避免多条时间线抢同一批属性
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.detailTimeline?.kill();
		this.context.state.labelTween?.kill();
		this.context.state.regionGeometry.finish();
		this.stopViewTransition(false);
		this.context.state.requestedView = view;
		if (this.context.state.reducedMotion.matches) {
			// 用户偏好减少动态效果：不走云层，直接落位
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
		// 地球保持当前尺寸不变，云层与镜头动作共用同一条时间线，保证擦除节奏一致
		this.context.state.viewTimeline = gsap.timeline({
			onComplete: () => {
				this.stopViewTransition();
				this.context.state.callbacks.onViewMotionChange?.("enter");
				// 中国视图入场：地图抬升与名称浮现交给既有的入场动画
				if (view === "china")
					this.context.state.mapEffects.restartEntrance(0.15);
				this.context.state.transitionTimeline?.play(0);
			},
		});
		if (this.context.state.view === "globe") {
			if (this.context.state.globeScene.mesh) {
				const turn = Math.PI * 2;
				// 把当前转角归一化到 [-π, π] 的相对区间，避免 gsap 沿反方向绕大半圈
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
			// 相机距离与 zoomLevel 互为倒数，先把当前缩放折算成距离倍率再补间回 1，
			// 这样无论用户停在哪一级缩放，退场速度都一致
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
		// 云层补间在 0.9s 起步、时长 3.2s（4.1s 才铺满），留出前段让旧视图先做完退场动作
		this.context.state.viewTimeline.to(
			this.context.state.cloudTransition.progress,
			{ value: 1, duration: 3.2, ease: "none" },
			0.9,
		);
		// 2.5s 时云层已铺满画面中心（进度约 0.5），在「看不见」的这一帧完成场景替换与相机落位
		this.context.state.viewTimeline.call(
			() => {
				this.applyView(view);
				this.context.state.callbacks.onViewChange?.(view);
				this.context.controllers().cameraMotion.prepareViewEntrance(view);
				if (view === "china")
					this.context.state.mapEffects.restartEntrance(1.75);
				// 云层叠加需要当前帧的颜色：先渲染主场景，再在其上合成云层，避免闪黑
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

	/**
	 * 把镜头复位到默认视角：已下钻则回到该层的归位点，否则回到当前视图的首页构图。
	 * 不做视图切换，只补间相机与俯仰角；地球视图还会按最短弧转回归位姿态。
	 */
	reset() {
		if (this.context.state.destroyed || !this.context.state.ready) return;
		// 边界过渡还在跑时几何正被过渡器接管，此时改镜头会导致画面错位
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
		// 视图切换中按复位：把时间线直接推到结尾，让 onComplete 完成收尾而不是中途杀断
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
			// 同样先归一化到 [-π, π]，保证从任意转角都走最短路径回位，不会倒转一圈
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

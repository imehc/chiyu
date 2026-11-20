/**
 * 大屏世界层入口（门面 / Facade）。
 * 负责把 world/ 目录下的相机、视图、区域下钻、交互、帧循环与资源控制器组装起来，
 * 并以一组命令式方法（切视图、切图层、缩放、下钻、重置等）对外暴露稳定 API。
 * 由 index.tsx 在 onMount 中实例化，页面其余部分只与本类打交道；销毁时统一走 destroy。
 */
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

/**
 * 场景控制器的组装者与对外门面。
 * 内部不直接操作 Three.js 对象，所有渲染细节都委托给各控制器；
 * 本类只保证「控制器之间的依赖顺序」与「事件监听的绑定/生命周期」。
 */
export default class BlueWorld {
	/** 全局可变状态（相机、视图、图层开关、过渡时间线等），是控制器之间的共享数据总线 */
	private readonly state: WorldState;
	/** 各领域控制器集合，按职责拆分；构造时一次性创建，之后只读引用 */
	private readonly controllers: WorldControllers;

	/**
	 * 创建整个世界层并挂上 DOM 事件。
	 * @param canvas 承载 WebGL 渲染的 canvas，交互事件都绑定在它上面
	 * @param callbacks 页面回调，用于把下钻、视图切换、监测点点击等事件抛给 Solid 层
	 */
	constructor(canvas: HTMLCanvasElement, callbacks: BlueWorldCallbacks = {}) {
		// 先建 state 再建控制器：控制器构造时会读取 state 并注册帧回调
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
		// 观察 canvas 的父容器而非 canvas 本身，避免渲染循环改写尺寸触发观察器抖动
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
		// passive:false 是必须的：滚轮缩放需要在处理器里 preventDefault 阻止页面滚动
		canvas.addEventListener("wheel", this.controllers.interaction.onWheel, {
			passive: false,
		});
		this.controllers.frame.animate();
		// 资源加载不阻塞首帧：先出空场景与加载进度，素材就绪后再回调 onReady
		void this.controllers.resources.load();
	}

	/** 关闭当前监测点浮窗并清除地图上的高亮 */
	closeMonitoringPoint() {
		return this.controllers.interaction.closeMonitoringPoint();
	}

	/**
	 * 开关某个地图图层。
	 * @param layer 图层标识，取值见 Layer 联合类型
	 * @param enabled 目标状态，false 时执行退场动画而非立即隐藏
	 */
	setLayer(layer: Layer, enabled: boolean) {
		return this.controllers.view.setLayer(layer, enabled);
	}

	/** 开关全球视图下的某类货运航线（铁路 / 海运 / 空运） */
	setFreightMode(mode: FreightMode, enabled: boolean) {
		return this.controllers.view.setFreightMode(mode, enabled);
	}

	/** 切换「全球 / 中国」视图，内部会触发云层遮罩过渡 */
	setView(view: View) {
		return this.controllers.view.setView(view);
	}

	/**
	 * 按倍率缩放相机。
	 * @param factor 大于 1 拉近、小于 1 拉远，调用方一般传 1.18 及其倒数
	 */
	zoom(factor: number) {
		return this.controllers.camera.zoom(factor);
	}

	/** 还原当前视图的默认机位与图层状态（只作用于当前层级，不回退下钻栈） */
	reset() {
		return this.controllers.view.reset();
	}

	/** 从当前行政区返回上一级；已在顶层时由 regions 控制器自行忽略 */
	goBack() {
		return this.controllers.regions.goBack();
	}

	/** 把相机切到正俯视，便于查看平面行政区轮廓 */
	setTopView() {
		return this.controllers.camera.setTopView();
	}

	/**
	 * 按名称或 adcode 下钻到下级行政区。
	 * @param name 行政区名称或行政编码，与当前层级数据中的字段对应
	 */
	drilldown(name: string | number) {
		return this.controllers.regions.drilldown(name);
	}

	/** 释放资源、移除监听并停止渲染循环，页面卸载时必须调用 */
	destroy() {
		return this.controllers.resources.destroy();
	}

	/**
	 * 汇总一份只读状态快照，供页面渲染与开发期调试 / 自动化断言使用。
	 * 快照每次调用都会新建对象，字段值来自 state 的即时状态，不含引用共享。
	 */
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
			// 取渲染缓冲尺寸与 draw call 数：用于性能排查，非业务数据
			renderSize: this.state.renderer.getSize(new Vector2()).toArray(),
			drawCalls: this.state.renderer.info.render.calls,
			requestedView: this.state.requestedView,
			resetScope: this.state.selectedRegion ?? this.state.view,
			viewTransitioning: this.state.switchingView,
			viewEntering: this.state.viewEntranceActive,
			cloudProgress: this.state.cloudTransition.progress.value,
			viewMix: this.state.viewMix,
			// 区域几何的过渡进度从 0 递增到 1，1 - progress 即「旧帧残影」的不透明度
			frameOpacity: this.state.regionGeometry.current
				? 1 - this.state.regionGeometry.current.progress
				: 0,
			// 快照纹理按需分配，目前不单独统计占用，保留字段以稳定调试接口
			transitionTextureBytes: 0,
			globeRotation: this.state.globeScene.mesh?.rotation.toArray().slice(0, 3),
			cameraPosition: this.state.camera.position.toArray(),
			// 任一过渡通道仍在跑都视为「转场中」，页面据此禁用重复点击
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

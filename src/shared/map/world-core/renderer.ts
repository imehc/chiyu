/**
 * WebGL 渲染器包装：创建 WebGLRenderer、跟随视口做 resize，
 * 并在开启后处理时改走 composer 出图。由 WorldCore 持有，
 * 每帧由 WorldCore.update 调用。
 */
import { type Scene, WebGLRenderer } from "three";
import type { Sizes } from "../utils/sizes";
import type Camera from "./camera";
import type { CameraConfig } from "./camera";

/**
 * 渲染器初始化配置：在相机配置（canvas / sizes / scene）之上
 * 补充相机包装对象与后处理开关。
 */
interface RendererConfig extends CameraConfig {
	/** 相机控制器，渲染时需要取它的 instance */
	camera: Camera;
	/** 是否走后处理管线；无 composer 时回退到直接渲染，当前项目未启用后处理 */
	postprocessing?: boolean;
	/** 后处理合成器，当前仅支持 null，保留扩展位 */
	composer?: null;
}

/**
 * 渲染器控制器。
 * 只暴露底层实例、resize、update、destroy 四项能力，生命周期与 WorldCore 一致。
 */
export default class Renderer {
	#canvas: HTMLCanvasElement;
	#sizes: Sizes;
	#scene: Scene;
	#camera: Camera;
	#postprocessing: boolean;
	#composer: { render: (delta?: number) => void } | null;
	/** WebGLRenderer 实例，构造函数末尾赋值，故使用明确赋值断言 */
	#instance!: WebGLRenderer;
	/**
	 * @param config canvas、尺寸、场景、相机与后处理配置
	 */
	constructor({
		canvas,
		sizes,
		scene,
		camera,
		postprocessing = false,
		composer = null,
	}: RendererConfig) {
		this.#canvas = canvas;
		this.#sizes = sizes;
		this.#scene = scene;
		this.#camera = camera;
		this.#postprocessing = postprocessing;
		this.#composer = composer;
		this.#setInstance();
	}

	/** 取底层 WebGLRenderer，用于改全局渲染状态（如输出色彩空间） */
	get instance() {
		return this.#instance;
	}

	/**
	 * 创建 WebGL 上下文。
	 * alpha: false 让画布不透明，省去与页面背景的合成；
	 * antialias 主要照顾地图描边与标签边缘的锯齿。
	 * 随后按视口设置绘制尺寸与像素比，像素比取自 Sizes（固定为 2，兼顾清晰度与填充率）。
	 */
	#setInstance() {
		this.#instance = new WebGLRenderer({
			alpha: false,
			antialias: true,
			canvas: this.#canvas,
		});
		this.#instance.setSize(this.#sizes.width, this.#sizes.height);
		this.#instance.setPixelRatio(this.#sizes.pixelRatio);
	}

	/**
	 * 视口变化后重设绘制缓冲尺寸与像素比。
	 * 只改 CSS 尺寸不会重算投影，相机的 updateProjectionMatrix 由 Camera 负责。
	 */
	resize() {
		this.#instance.setSize(this.#sizes.width, this.#sizes.height);
		this.#instance.setPixelRatio(this.#sizes.pixelRatio);
	}
	/**
	 * 出图。
	 * @param delta 帧间隔（秒），仅在走后处理时传给 composer
	 */
	update(delta?: number) {
		if (this.#postprocessing && this.#composer) {
			this.#composer.render(delta);
		} else {
			this.#instance.render(this.#scene, this.#camera.instance);
		}
	}
	/**
	 * 释放渲染资源。
	 * dispose 只销毁 Three.js 内部对象，forceContextLoss 才会让浏览器回收
	 * WebGL 上下文；两者都调用，避免反复挂载时耗尽浏览器的上下文配额。
	 */
	destroy() {
		this.#instance.dispose();
		this.#instance.forceContextLoss();
	}
}

/**
 * 3D 地图相机：封装透视/正交两种投影，并绑定 OrbitControls 轨道控制。
 * 由 WorldCore 在初始化时创建并持有，渲染器与 CSS3D 标签层都直接从
 * 这里取相机实例，保证两层使用同一套视图矩阵。
 */
import {
	OrthographicCamera,
	PerspectiveCamera,
	type Scene,
	type Camera as ThreeCamera,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Sizes } from "../utils/sizes";
import type { WorldCoreConfig } from ".";

/**
 * 相机初始化依赖。
 */
export interface CameraConfig {
	/** 视口尺寸管理器，提供 width / height 并在窗口变化时派发 resize */
	sizes: Sizes;
	/** 相机要挂载的场景，Three.js 要求相机参与场景才能被渲染器识别 */
	scene: Scene;
	/** 用于绑定鼠标/触摸事件的原生 canvas */
	canvas: HTMLCanvasElement;
}

/** 两种投影相机的联合类型 */
type CameraInstance = PerspectiveCamera | OrthographicCamera;

/**
 * 地图相机控制器。
 * 只维护一个相机实例与一套控制器，投影方式在构造时确定后不再切换。
 * 三块大屏目前都用默认的透视投影，正交模式保留给不需要近大远小的场景。
 */
export default class Camera {
	#sizes: Sizes;
	#scene: Scene;
	#canvas: HTMLCanvasElement;
	/** 合并默认值后的配置，isOrthographic 决定投影类型 */
	#options: WorldCoreConfig;
	/** 当前相机实例，构造过程中先置空，setInstance 之后必有值 */
	#instance: CameraInstance | null = null;
	/** 轨道控制器，与相机同生命周期，destroy 时释放 */
	#controls: OrbitControls | null = null;

	/**
	 * @param config 场景、canvas 与视口尺寸
	 * @param options 投影方式，缺省为透视投影
	 */
	constructor(
		{ sizes, scene, canvas }: CameraConfig,
		options: WorldCoreConfig = { isOrthographic: false },
	) {
		this.#sizes = sizes;
		this.#scene = scene;
		this.#canvas = canvas;
		this.#options = Object.assign({ isOrthographic: false }, options);
		this.#setInstance();
	}

	/** 取相机实例，调用前请确认已完成构造 */
	get instance() {
		return this.#instance as CameraInstance;
	}

	/**
	 * 重建相机并挂回场景。
	 * 先把旧实例置空，避免后续步骤失败时留下半初始化的对象；
	 * 位置 (10, 10, 10) 只是库内的安全默认值，大屏构造完会立即用自身机位覆盖。
	 */
	#setInstance() {
		this.#instance = null;
		this.#setCamera(this.#options.isOrthographic);
		if (this.#instance) {
			(this.#instance as ThreeCamera).position.set(10, 10, 10);
			(this.#scene as Scene).add(this.#instance);
		}
	}

	/**
	 * 创建相机实例并绑定控制器。
	 * @param isOrthographic true 使用正交相机，false 使用透视相机；形参缺省为 true，调用处均显式传值
	 */
	#setCamera(isOrthographic = true) {
		const aspect = this.#sizes.width / this.#sizes.height;
		if (isOrthographic) {
			// 正交视锥半高固定为 120，左右再按宽高比展开，
			// 这样换分辨率时地图在纵向的可视范围不变、横向按比例增减。
			const s = 120;
			this.#instance = new OrthographicCamera(
				-s * aspect,
				s * aspect,
				s,
				-s,
				1,
				10000,
			);
		} else {
			// 透视相机：45° 垂直视场角，近/远裁剪面取 1 和 10000，
			// 量级覆盖地图与远处粒子，避免被近裁剪面切掉。
			this.#instance = new PerspectiveCamera(45, aspect, 1, 10000);
		}
		this.#setControls();
	}

	/**
	 * 绑定轨道控制器。
	 * 开启阻尼后拖拽与缩放会带惯性，但必须每帧调用 update 才会生效。
	 */
	#setControls() {
		this.#controls = new OrbitControls(this.#instance as ThreeCamera, this.#canvas);
		this.#controls.enableDamping = true;
		this.#controls.update();
	}

	/**
	 * 视口尺寸变化后同步相机参数。
	 * 正交相机要重算四边边界，透视相机只改 aspect，二者都要重算投影矩阵。
	 */
	resize() {
		const aspect = this.#sizes.width / this.#sizes.height;
		if (this.#options.isOrthographic) {
			const s = 120;
			if (this.#instance instanceof OrthographicCamera) {
				this.#instance.left = -s * aspect;
				this.#instance.right = s * aspect;
				this.#instance.top = s;
				this.#instance.bottom = -s;
			}
		} else {
			if (this.#instance instanceof PerspectiveCamera) {
				this.#instance.aspect = aspect;
			}
		}
		// 投影参数只是普通字段，Three.js 不会自动感知，必须手动重算矩阵
		this.#instance?.updateProjectionMatrix();
	}
	/** 每帧推进控制器阻尼；delta 为帧间隔（秒），由 Time 的 tick 事件透传 */
	update(delta?: number) {
		this.#controls?.update(delta);
	}
	/** 解绑控制器事件监听，避免场景销毁后仍持有 canvas 引用 */
	destroy() {
		this.#controls?.dispose();
	}
}

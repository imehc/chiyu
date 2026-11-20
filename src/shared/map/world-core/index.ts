/**
 * 3D 场景核心（WorldCore）：把 Scene、Sizes、Time、Camera、Renderer 组装成
 * 一套可 resize、可逐帧更新的最小运行时。重庆、广东、中国三块大屏的地图场景
 * 都由这个入口创建，再向外暴露 scene / camera / renderer 等句柄给地图组件使用。
 */
import { AxesHelper, Mesh, Scene } from "three";
import EventEmitter from "../utils/event-emitter";
import { Sizes } from "../utils/sizes";
import Time from "../utils/time";
import Camera from "./camera";
import Renderer from "./renderer";

/** 默认配置：三块大屏都沿用默认的透视投影，需要正交时由调用方显式传入 */
const defaultConfig = {
	isOrthographic: false,
};

/**
 * 场景核心配置。
 */
export type WorldCoreConfig = {
	/** 是否使用正交投影  */
	isOrthographic: boolean;
};

/**
 * 场景核心。
 * 内部订阅 sizes 的 resize 与 time 的 tick，分别转发到自身的 resize / update，
 * 因此外部只要实例化一次，就得到了完整的渲染循环。
 */
export default class WorldCore extends EventEmitter {
	#canvas: HTMLCanvasElement;
	/** 合并默认值后的配置 */
	#config: WorldCoreConfig;
	/** Three.js 场景根节点，地图、网格、粒子都挂在这里 */
	#scene: Scene;
	/** 视口尺寸，读取 canvas 父容器的 offsetWidth/offsetHeight，单位 CSS 像素 */
	#sizes: Sizes;
	/** 帧循环，emit("tick", delta 秒, 累计秒) */
	#time: Time;
	/** 相机控制器，构造时按配置选择投影方式 */
	#camera: Camera;
	/** WebGL 渲染器包装 */
	#renderer: Renderer;

	/**
	 * 按 canvas → 尺寸 → 时间 → 相机 → 渲染器的顺序初始化，
	 * 相机依赖尺寸算视锥，渲染器依赖相机，顺序不可调换；
	 * 末尾把尺寸变化与每帧回调接到自身方法上。
	 */
	constructor(
		canvas: HTMLCanvasElement,
		config: WorldCoreConfig = { isOrthographic: false },
	) {
		super();
		this.#canvas = canvas;
		this.#config = Object.assign({}, defaultConfig, config);
		this.#scene = new Scene();
		this.#sizes = new Sizes({ canvas });
		this.#time = new Time();
		this.#camera = new Camera(
			{
				sizes: this.#sizes,
				scene: this.#scene,
				canvas: this.#canvas,
			},
			{ isOrthographic: this.#config.isOrthographic },
		);
		this.#renderer = new Renderer({
			sizes: this.#sizes,
			scene: this.#scene,
			canvas: this.#canvas,
			camera: this.#camera,
		});
		this.#sizes.on("resize", () => {
			this.resize();
		});
		this.#time.on("tick", (delta) => {
			this.update(delta);
		});
	}

	/** 原生 canvas，外部可据此追加 DOM 覆盖层 */
	get canvas() {
		return this.#canvas;
	}

	/** 视口尺寸管理器 */
	get sizes() {
		return this.#sizes;
	}

	/** Three.js 场景，地图组件通过 setParent 挂到这里 */
	get scene() {
		return this.#scene;
	}

	/** 相机控制器，取相机实例需使用 camera.instance */
	get camera() {
		return this.#camera;
	}

	/** 帧循环，可用来订阅 tick 或暂停渲染 */
	get time() {
		return this.#time;
	}

	/** WebGL 渲染器包装，取底层渲染器需使用 renderer.instance */
	get renderer() {
		return this.#renderer;
	}

	/**
	 * 添加坐标轴辅助对象，仅用于开发期确认坐标轴方向。
	 * @param size 坐标轴长度（世界坐标单位），默认 250；传 0 则跳过，便于用开关关闭
	 */
	setAxesHelper(size = 250) {
		if (!size) {
			return;
		}
		const axes = new AxesHelper(size);
		this.#scene.add(axes);
	}

	/** 窗口尺寸变化时同时刷新相机视锥与渲染器绘制缓冲 */
	resize() {
		this.#camera.resize();
		this.#renderer.resize();
	}
	/** 每帧驱动相机阻尼与渲染出图；delta 由 Time 的 tick 提供，单位为秒 */
	update(delta?: number) {
		this.#camera.update(delta);
		this.#renderer.update(delta);
	}
	/**
	 * 销毁整个场景。
	 * 先停掉尺寸监听与帧循环，再销毁相机、渲染器；
	 * 随后遍历场景，仅对 Mesh 释放几何体与材质，最后把 canvas 从 DOM 摘除。
	 */
	destroy() {
		this.#sizes.destroy();
		this.#time.destroy();
		this.#camera.destroy();
		this.#renderer.destroy();
		// Three.js 不自动回收 GPU 资源，需要逐个 Mesh 手动释放
		this.#scene.traverse((child) => {
			if (child instanceof Mesh) {
				child.geometry.dispose();
				// 材质上的贴图（map、alphaMap 等）同样占用显存，一并 dispose
				for (const key in child.material) {
					const value = child.material[key];
					if (value && typeof value.dispose === "function") {
						value.dispose();
					}
				}
			}
		});
		// canvas 由外部创建并传入，这里只负责把它从父节点移除
		(this.#canvas.parentNode as HTMLElement | null)?.removeChild(this.#canvas);
	}
}

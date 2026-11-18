import {
	OrthographicCamera,
	PerspectiveCamera,
	type Scene,
	type Camera as ThreeCamera,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Sizes } from "../utils/sizes";
import type { WorldCoreConfig } from ".";

export interface CameraConfig {
	sizes: Sizes;
	scene: Scene;
	canvas: HTMLCanvasElement;
}

type CameraInstance = PerspectiveCamera | OrthographicCamera;

export default class Camera {
	#sizes: Sizes;
	#scene: Scene;
	#canvas: HTMLCanvasElement;
	#options: WorldCoreConfig;
	#instance: CameraInstance | null = null;
	#controls: OrbitControls | null = null;

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

	get instance() {
		return this.#instance as CameraInstance;
	}

	#setInstance() {
		this.#instance = null;
		this.#setCamera(this.#options.isOrthographic);
		if (this.#instance) {
			(this.#instance as ThreeCamera).position.set(10, 10, 10);
			(this.#scene as Scene).add(this.#instance);
		}
	}

	/**
	 * 设置当前相机
	 * @param isOrthographic true 默认正交相机，false 透视相机
	 */
	#setCamera(isOrthographic = true) {
		const aspect = this.#sizes.width / this.#sizes.height;
		if (isOrthographic) {
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
			// 透视相机
			this.#instance = new PerspectiveCamera(45, aspect, 1, 10000);
		}
		this.#setControls();
	}

	#setControls() {
		this.#controls = new OrbitControls(this.#instance as ThreeCamera, this.#canvas);
		this.#controls.enableDamping = true;
		this.#controls.update();
	}

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
		this.#instance?.updateProjectionMatrix();
	}
	update(delta?: number) {
		this.#controls?.update(delta);
	}
	destroy() {
		this.#controls?.dispose();
	}
}

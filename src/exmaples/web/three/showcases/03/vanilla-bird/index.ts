import { mountExampleGui } from "@site/src/exmaples/web/componets/mountExampleGui";
import { GUI } from "dat.gui";
import { gsap } from "gsap";
import {
	Mesh,
	type PerspectiveCamera,
	type Scene,
	type WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadBirds } from "./components/birds";
import { createCamera } from "./components/camera";
import { createAxesHelper } from "./components/helpers";
import { createLights } from "./components/lights";
import { createScene } from "./components/scene";
import { Train } from "./components/Train";
import { createControls } from "./systems/controls";
import Loop from "./systems/Loop";
import Resizer from "./systems/Resizer";
import { createRenderer } from "./systems/renderer";

export class Model {
	private readonly scene: Scene;
	private readonly camera: PerspectiveCamera;
	private readonly renderer: WebGLRenderer;
	private readonly loop: Loop;
	private readonly controls: OrbitControls;
	private readonly gui: GUI;
	private readonly resizer: Resizer;
	private disposed = false;

	constructor(container: HTMLElement) {
		if (!container) {
			throw new Error("You have to pass a element");
		}
		this.gui = mountExampleGui(new GUI({ autoPlace: false }), container);
		this.camera = createCamera();
		this.scene = createScene();
		this.renderer = createRenderer();
		this.loop = new Loop(this.camera, this.scene, this.renderer, container);

		container.append(this.renderer.domElement);

		this.controls = createControls(this.camera, this.renderer.domElement);
		this.controls.addEventListener("change", () => {
			// 按需渲染需要执行以获取下一帧
			this.render();
		});

		const { ambientLight, mainLight } = createLights();
		new Train();

		// this.loop.updatables.push(controls, train);

		this.scene.add(ambientLight, mainLight /**train */);

		this.resizer = new Resizer(container, this.camera, this.renderer);
		this.resizer.onResize = () => {
			// 添加动画后会自动刷新，所以可以移除该函数
			this.render(); // 处理变化时需重新执行，避免物体拉升变形
		};

		this.scene.add(createAxesHelper() /**createGridHelper() */);
	}

	/**
	 * 按需渲染
	 */
	public render() {
		if (this.disposed) return;
		this.renderer.render(this.scene, this.camera);
	}

	/**
	 * 循环运行
	 */
	public start() {
		if (this.disposed) return;
		this.loop.start();
	}

	/**
	 * 停止循环运行
	 */
	public stop() {
		this.loop.stop();
	}

	public async init() {
		const birds = await loadBirds(this.gui, () => this.disposed);
		if (!birds) return;
		const { parrot, flamingo, stork } = birds;

		this.controls.target.copy(parrot.position); // 把目标移到前鸟的中心

		this.loop.updatables.push(parrot, flamingo, stork);
		this.scene.add(parrot, flamingo, stork);
	}

	/**
	 * 执行销毁方法
	 */
	public dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.loop.dispose();
		this.resizer.dispose();
		this.controls.dispose();
		this.gui.destroy();

		this.scene.traverse((object) => {
			gsap.killTweensOf(object.position);
			if (!(object instanceof Mesh)) return;
			object.geometry.dispose();
			const materials = Array.isArray(object.material)
				? object.material
				: [object.material];
			for (const material of materials) material.dispose();
		});
		this.scene.clear();
		// 销毁渲染器等
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}

export default Model;

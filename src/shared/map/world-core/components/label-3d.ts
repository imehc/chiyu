/**
 * CSS3D 标签层：用 CSS3DRenderer 把真实 DOM 元素按 3D 坐标投影到屏幕上，
 * 得到可换行、可加样式的地图标注。它叠在 WebGL canvas 之上单独渲染一层，
 * 与主渲染器共用同一个 Scene 与相机，因此标签会跟随地图一起缩放与旋转。
 */
import type { Object3D, Scene } from "three";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { Sizes } from "../../utils/sizes";
import type Time from "../../utils/time";
import { uuid } from "../../utils/uuid";
import type Camera from "../camera";
import type { CameraConfig } from "../camera";
import CSS3DObject from "../extensions/css-3d-object";
import CSS3DSprite from "../extensions/css-3d-sprite";

/**
 * 标签层初始化配置：在相机配置基础上补充相机包装与帧循环。
 */
interface Label3DConfig extends CameraConfig {
	/** 相机控制器，CSS3D 渲染需要与 WebGL 用同一相机 */
	camera: Camera;
	/** 帧循环，标签层逐帧同步渲染 */
	time: Time;
}

/** 标签对象：普通朝向（CSS3DObject）或始终面向相机（CSS3DSprite） */
export type Label = CSS3DObject | CSS3DSprite;

/**
 * CSS3D 标签管理器。
 * 除创建 / 移除标签外，还负责把 CSS3D 的 DOM 层与 canvas 对齐，
 * 并订阅 resize 与 tick，保证尺寸和相机变化时标签不漂移。
 */
export default class Label3D {
	#canvas: HTMLCanvasElement;
	#sizes: Sizes;
	#scene: Scene;
	#camera: Camera;
	#time: Time;
	/** 最近一次 setParent 指定的父节点，remove 时从这里摘除 */
	#parent: Object3D | null;
	#css3DRenderer: CSS3DRenderer;

	/**
	 * 创建 CSS3D 渲染器，并把它的 DOM 层插入到与 canvas 同级的位置。
	 */
	constructor(config: Label3DConfig) {
		this.#canvas = config.canvas;
		this.#sizes = config.sizes;
		this.#scene = config.scene;
		this.#camera = config.camera;
		this.#time = config.time;
		this.#parent = null;
		const { width, height } = this.#sizes;
		this.#css3DRenderer = new CSS3DRenderer();
		this.#css3DRenderer.setSize(width, height);
		// 绝对定位铺满 canvas，zIndex 9999 保证标签浮在所有画布元素之上
		this.#css3DRenderer.domElement.style.position = "absolute";
		this.#css3DRenderer.domElement.style.top = "0px";
		this.#css3DRenderer.domElement.style.left = "0px";
		// 标签是纯展示层，默认不接收鼠标事件，避免挡住地图的拖拽与 hover
		this.#css3DRenderer.domElement.style.pointerEvents = "none";
		this.#css3DRenderer.domElement.style.zIndex = "9999";
		// 用 uuid 生成唯一 class，多实例时可在样式或调试中区分各自的 DOM 层
		this.#css3DRenderer.domElement.className = `label3d-${uuid()}`;
		this.#canvas.parentNode?.appendChild(this.#css3DRenderer.domElement);
		// 每帧重新渲染，标签的屏幕坐标才会跟随相机变化
		this.#time.on("tick", () => {
			this.update();
		});
		this.#sizes.on("resize", () => {
			this.resize();
		});
	}

	/**
	 * 创建一个标签节点并包装成 CSS3D 对象。
	 * @param content 初始 HTML 字符串，后续可通过 label.init 覆盖
	 * @param className 自定义样式类；为空时套用内置的暗色圆角气泡样式
	 * @param isSprite true 使用 CSS3DSprite，标签始终正对相机；false 则跟随父级朝向
	 * @returns 扩展过 init / hide / show / setParent 等便捷方法的标签对象
	 */
	create(content = "", className = "", isSprite = false) {
		const tag = document.createElement("div");
		tag.innerHTML = content;
		tag.className = className;
		// 先隐藏，待调用方 init / setParent 后再显示，避免在默认位置闪一下
		tag.style.visibility = "hidden";
		tag.style.position = "absolute";
		if (!className) {
			tag.style.padding = "10px";
			tag.style.color = "#fff";
			tag.style.fontSize = "12px";
			tag.style.textAlign = "center";
			tag.style.background = "rgba(0,0,0,0.6)";
			tag.style.borderRadius = "4px";
		}
		let label: Label;
		// 两种包装只差朝向逻辑：Object 跟随父级旋转，Sprite 始终面向相机
		if (!isSprite) {
			label = new CSS3DObject(tag);
		} else {
			label = new CSS3DSprite(tag);
		}
		// 把 DOM 操作收敛到标签对象上，调用方不必再关心 CSS3D 内部结构
		label.init = (content, position) => {
			label.element.innerHTML = content;
			label.element.style.visibility = "visible";
			label.position.copy(position);
		};
		label.hide = () => {
			label.element.style.visibility = "hidden";
		};
		label.scaleHide = () => {
			label.element.classList.add("scale-hidden");
		};
		label.show = () => {
			label.element.style.visibility = "visible";
			label.element.classList.remove("scale-hidden");
		};
		label.setParent = (parent) => {
			this.#parent = parent;
			parent.add(label);
		};
		label.remove = () => {
			this.#parent?.remove(label);
			return label;
		};
		return label;
	}

	/**
	 * 统一设置标签的缩放、朝向与鼠标穿透。
	 * @param scale 统一缩放，默认 0.1：CSS3D 中 1 个世界单位等于 1 像素，
	 * 缩到 0.1 才能与地图的比例匹配，否则标签会大得离谱
	 * @param axis 绕哪根轴旋转，默认 x 轴——把竖直的 DOM 平面放平贴到地图上
	 * @param axisRotation 旋转弧度，默认 90°
	 * @param pointerEvents CSS 的 pointer-events 取值，默认 none 不拦截交互
	 */
	setLabelStyle(
		label: Label,
		scale = 0.1,
		axis: "x" | "y" | "z" = "x",
		axisRotation = Math.PI / 2,
		pointerEvents = "none",
	) {
		label.element.style.pointerEvents = pointerEvents;
		label.scale.set(scale, scale, scale);
		// 控制 HTML 标签在 3D 空间中的朝向，使其贴合地图平面
		switch (axis) {
			case "x":
				label.rotation.x = axisRotation;
				break;
			case "y":
				label.rotation.y = axisRotation;
				break;
			case "z":
				label.rotation.z = axisRotation;
				break;
			default:
				// 如果传入了无效的轴，默认使用 x 轴
				label.rotation.x = axisRotation;
				break;
		}
	}

	/** 调整 CSS3D 图层的 z-index，用于与其它 DOM 浮层重新排序 */
	setRenderLevel(zIndex: string) {
		this.#css3DRenderer.domElement.style.zIndex = zIndex;
	}

	/** 每帧调用：以同一相机重新渲染 CSS3D 场景，让标签跟随视图变换 */
	update() {
		this.#css3DRenderer.render(this.#scene, this.#camera.instance);
	}

	/** 视口变化时同步 CSS3D 渲染器尺寸，否则标签的投影位置会整体偏移 */
	resize() {
		const { width, height } = this.#sizes;
		this.#css3DRenderer.setSize(width, height);
	}

	/** 移除 CSS3D 层的 DOM 节点，场景中已创建的标签随之不再显示 */
	destroy() {
		if (this.#css3DRenderer) {
			const domElement = this.#css3DRenderer.domElement;
			domElement.parentNode?.removeChild(domElement);
		}
	}
}

/**
 * 聚焦光标：标记当前选中区域的复合动效，由旋转圆环、旋转箭头、
 * 扩散光圈与十字准星叠成，全部是贴透明图层的 PlaneGeometry，动画由 gsap 驱动。
 * 由大屏 world 创建后常驻场景，通过整体显隐或暂停来控制展示时机。
 */
import gsap from "gsap";
import {
	AdditiveBlending,
	Color,
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	PlaneGeometry,
	type Texture,
} from "three";
import type Assets from "../../assets";
import type Resource from "../../utils/resource";

/** 运行时依赖：只用到资源管理器取贴图 */
interface FocusConfig {
	assets: Assets;
}

/** 选项类型即默认选项的结构 */
type FocusOption = typeof defaultOption;

/** 默认配色：主色为金黄 0xfcc957，中心圆环单独用白色 */
const defaultOption = {
	color1: 0xfcc957,
	color2: 0xffffff,
};

/**
 * 需要循环动画的三个网格引用。
 * 提前缓存，避免每帧或每次补间都在场景树里按名字查找。
 */
type GsapElement = {
	/** 中心圆环，绕 Z 轴匀速自转 */
	focusMidQuan: Mesh;
	/** 箭头层，转速比圆环快，形成内外两层节奏差 */
	focusArrows: Mesh;
	/** 扩散光圈，缩放与透明度同步做周期性变化 */
	focusMoveBg: Mesh;
};

/**
 * 聚焦标记。
 * 继承 Object3D，自身即容器；所有子网格设 renderOrder 99 以压在地图与柱体之上。
 */
export default class Focus extends Object3D {
	/** 资源包装，instance 在加载完成前可能为 null，取贴图时要判空 */
	#assets: { instance: Resource | null };
	#option: FocusOption;
	#gsapObjects: gsap.core.Tween[]; // gsap对象
	#animateElements: GsapElement; // gsap动画对象

	/**
	 * @param config 资源依赖
	 * @param option 配色覆盖
	 */
	constructor(config: FocusConfig, option: Partial<FocusOption>) {
		super();
		this.#option = Object.assign({}, defaultOption, option);
		this.#assets = { instance: null };
		this.#assets.instance = config.assets.instance;
		this.#gsapObjects = []; // gsap对象
		this.#animateElements = {} as GsapElement; // gsap动画对象
		this.init();
	}

	/**
	 * 构建全部子网格与材质。
	 * 贴图都来自 assets，先 clone 一份基础材质再逐份替换 map，
	 * 这样颜色、混合、朝向等公共参数只维护一处。
	 */
	init() {
		const color = this.#option.color1;
		// 几何体：主图层用 1.5×1.5 的平面，分段 1（两个三角形）即可，
		// 贴图本身带圆形图案，几何不需要细分
		const geometry = new PlaneGeometry(1.5, 1.5, 1);
		// 十字准星：1×3 的竖条沿 Y 上移 1 后覆盖 -0.5~2.5，旋转后沿 z 同区间，两端不关于原点对称
		const barGeometry = new PlaneGeometry(1, 3, 1);
		barGeometry.translate(0, 1, 0);
		// 材质：关闭深度写入，让多层透明贴图按 renderOrder 稳定叠加，
		// 不会因为半透明互相写入深度而出现「谁先画谁被裁」的黑边
		const material = new MeshBasicMaterial({
			color,
			transparent: true,
			fog: false,
			side: DoubleSide,
			depthWrite: false,
		});
		const focusArrowsMaterial = material.clone();

		focusArrowsMaterial.map = this.#assets.instance?.getResource(
			"focusArrows",
		) as Texture;
		const focusBarMaterial = material.clone();
		focusBarMaterial.map = this.#assets.instance?.getResource(
			"focusBar",
		) as Texture;
		const focusBgMaterial = material.clone();
		focusBgMaterial.map = this.#assets.instance?.getResource(
			"focusBg",
		) as Texture;
		const focusMidQuanMaterial = material.clone();
		focusMidQuanMaterial.color = new Color(this.#option.color2);
		focusMidQuanMaterial.map = this.#assets.instance?.getResource(
			"focusMidQuan",
		) as Texture;
		const focusMoveBgMaterial = material.clone();
		focusMoveBgMaterial.map = this.#assets.instance?.getResource(
			"focusMoveBg",
		) as Texture;
		focusMoveBgMaterial.blending = AdditiveBlending;
		// 以下均为几何体 + 材质的两两组合，贴图决定了每层的图案
		const focusArrows = new Mesh(geometry, focusArrowsMaterial);
		const focusBar1 = new Mesh(barGeometry, focusBarMaterial);
		// 竖条先绕 X 轴转 90°，作为十字的一臂
		focusBar1.rotation.x = Math.PI / 2;
		// clone 共享几何与材质、只复制变换矩阵；再绕 Y 轴转 90° 交叉成另一臂
		const focusBar2 = focusBar1.clone();
		focusBar2.rotation.y = Math.PI / 2;
		const focusBg = new Mesh(geometry, focusBgMaterial);
		const focusMidQuan = new Mesh(geometry, focusMidQuanMaterial);
		const focusMoveBg = new Mesh(geometry, focusMoveBgMaterial);

		const groupElement = [
			focusMidQuan,
			focusBg,
			focusArrows,
			focusMoveBg,
			focusBar1,
			focusBar2,
		];
		// 99 是本项目约定的「最上层」渲染顺序，确保标记不被地图与柱体遮住
		groupElement.forEach((element) => {
			element.renderOrder = 99;
		});
		this.add(...groupElement);
		// 扩散光圈从 0 开始放大，配合透明度补间形成一波波向外扩散的效果
		const moveBgScale = 0;
		focusMoveBg.scale.setScalar(moveBgScale);
		this.#animateElements = { focusMidQuan, focusArrows, focusMoveBg };
		this.startAnimate();
	}

	/**
	 * 创建 gsap 补间。
	 * 四个循环补间全部 repeat: -1、ease: none，保证匀速且无限播放；
	 * 圆环 8s 一圈、箭头 5s 一圈，周期不同，视觉上不会同时回到起点而「顿一下」。
	 */
	startAnimate() {
		const quanTween = gsap.to(this.#animateElements.focusMidQuan.rotation, {
			z: 2 * Math.PI,
			duration: 8,
			repeat: -1,
			ease: "none",
		});

		const focusArrowsTween = gsap.to(
			this.#animateElements.focusArrows.rotation,
			{
				z: 2 * Math.PI,
				duration: 5,
				repeat: -1,
				ease: "none",
			},
		);
		// 缩放与透明度时长一致：光圈放到 1.5 倍时刚好完全透明，衔接下一轮不会有跳变
		const focusMoveBgTween = gsap.to(this.#animateElements.focusMoveBg.scale, {
			x: 1.5,
			y: 1.5,
			z: 1.5,
			duration: 2.5,
			repeat: -1,
			ease: "none",
		});
		const focusMoveBgMaterialTween = gsap.to(
			this.#animateElements.focusMoveBg.material,
			{
				opacity: 0,
				duration: 2.5,
				repeat: -1,
				ease: "none",
			},
		);
		// 统一持有补间句柄，暂停/销毁时才能一次性操作全部动画
		this.#gsapObjects = [
			quanTween,
			focusArrowsTween,
			focusMoveBgTween,
			focusMoveBgMaterialTween,
		];
	}

	/** 暂停动画：大屏切到后台或该区域暂不需要提示时调用，保留当前帧状态 */
	pausedAnimate() {
		this.#gsapObjects.forEach((element) => {
			element.pause();
		});
	}

	/**
	 * 结束动画。
	 * kill 会把补间从 gsap 的全局时间轴摘除，避免对象被移除后仍被逐帧写属性。
	 */
	destroy() {
		// 停止所有 gsap 动画
		this.#gsapObjects.forEach((element) => {
			element.kill();
		});
	}
}

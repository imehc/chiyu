/**
 * 3D 环形饼图：用 Three.js 的 ExtrudeGeometry 把扇环挤出厚度，靠 z 轴缩放与透明度做轮播高亮。
 * 经 yearly-economy-trend.tsx 被重庆 / 广东大屏的「年度经济增长点」卡片复用，数据全部由 props 注入（示例数据，单位亿元）。
 */

import { cn } from "cn";
import gsap from "gsap";
import { createSignal, type JSXElement, onCleanup, onMount } from "solid-js";
import {
	AmbientLight,
	AxesHelper,
	Color,
	DirectionalLight,
	DoubleSide,
	ExtrudeGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	type Object3D,
	PerspectiveCamera,
	PlaneGeometry,
	RepeatWrapping,
	Scene,
	Shape,
	TextureLoader,
	type Camera as ThreeCamera,
	Vector3,
	WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { emptyObject } from "../utils/empty-object";

/**
 * Pie 实例的构造参数，由 PieChart 在挂载时按容器实际尺寸一次性快照传入（后续 data 变化不会回写）。
 */
interface PieOption {
	/** 画布逻辑宽度（px），取自容器 offsetWidth，resize 时被覆盖 */
	width: number;
	/** 画布逻辑高度（px），取自容器 offsetHeight，resize 时被覆盖 */
	height: number;
	/** 所有 value 之和，作为 100% 的分母；由组件在渲染时求和后传入 */
	count: number;
	/** 扇区数据，value 的量级需与 count 同单位（大屏示例为亿元） */
	data: Array<{ name: string; value: number }>;
	/** 扇区颜色池，按下标取模循环使用，支持 "#17E6C3" 与 0x20faae 两种写法 */
	colors: Array<string | number>;
	/** 扇区基础不透明度（非高亮态），0~1 */
	opacity: number;
	/** 轮播间隔（ms），即每个扇区保持高亮的时长 */
	delay: number;
	/** 一轮轮播结束（下标绕回 0）时触发，用于同步外部文案或动画 */
	loopComplete?: () => void;
	/** 每次切换到下一个扇区时把新下标回抛给组件，驱动中心文字 */
	onChange?: (index: number) => void;
}

/** 3D 场景中一张贴图平面的配置，用于饼图背后那几层装饰圆环。 */
type PlaneOption = {
	/** 贴图地址，相对 public 根目录 */
	url: string;
	/** 平面边长，世界坐标单位（正方形，宽高同值） */
	width: number;
	/** 平面沿 z 轴的偏移，负值越大越靠后，用来堆叠多层纹理 */
	z: number;
	/** 平面在世界坐标中的位置 */
	position: Vector3;
	/** 是否绕自身法线无限旋转（雷达扫光效果） */
	animate: boolean;
	/** 叠加染色，null 表示保留贴图原色 */
	color: string | null;
};

/** 单个扇环的几何参数，角度一律为弧度，0 指向 +x 并经旋转后落到世界坐标的水平面。 */
type RingOption = {
	/** 内圆半径 */
	innerRadius: number;
	/** 外圈半径 */
	outerRadius: number;
	/** 厚度 */
	thickness: number;
	/** 起始弧度，由 createPie 按前序扇区的占比依次累加得到 */
	startAngle: number;
	/** 结束弧度，与 startAngle 之间留 0.0001 弧度缝隙避免相邻扇区共面闪烁 */
	endAngle: number;
	/** 扇环颜色（three 的 Color 实例） */
	color: Color;
	/** 圆弧采样段数，越大弧线越平滑，120 段对当前半径足够 */
	segments: number;
};

/**
 * 一整个 3D 环形饼图的运行时封装：场景、相机、渲染器、轮播定时器都收在这里。
 * 不依赖 Solid，由 PieChart 组件负责 new / destroy，命令式调用 start、stop、resize。
 */
class Pie {
	/** 所有扇环 mesh 的父级，按下标访问 children 即可拿到对应扇区 */
	#pieGroup: Group;
	/** canvas 的宿主元素，resize 时用它的 offsetWidth / offsetHeight 读取新尺寸 */
	#container: HTMLDivElement;
	/** 构造参数快照，resize 会就地改写宽高 */
	#option: PieOption;
	/** 场景，destroy 时置 null 以便 GC */
	#scene: Scene | null = null;
	/** 透视相机，aspect 随容器变化更新 */
	#camera: PerspectiveCamera | null = null;
	/** WebGL 渲染器，持有 canvas 与 WebGL 上下文，destroy 必须 dispose */
	#renderer: WebGLRenderer | null = null;
	/** 坐标轴辅助对象，尺寸给 0 因此不可见，仅保留引用便于统一回收 */
	#axes: AxesHelper | null = null;
	/** 轨道控制器，默认关闭，start 后才允许用户拖拽 */
	#controls: OrbitControls | null = null;
	/** 轮播定时器句柄，stop / destroy 时清理 */
	#timer: ReturnType<typeof setInterval> | null = null;
	/** 当前高亮的扇区下标 */
	#activeIndex = 0;

	/**
	 * 装饰平面的默认值。
	 * 注意 Object.assign 以它为 target，会把本次传入的字段就地写回，后续调用会继承上一次的结果；
	 * 现有调用都显式给了 url / width / position 等关键字段，所以表现仍符合预期。
	 */
	readonly #defaultPlaneOption: PlaneOption = {
		url: "texture/ring1.png",
		width: 5.5,
		z: 0,
		position: new Vector3(0, 0, 0),
		animate: false,
		color: null,
	};
	/** 扇环默认几何：半径 1.5~2 世界单位，四分之一圆，青色调；实际调用只覆盖角度与颜色 */
	readonly #defaultRingOption: RingOption = {
		innerRadius: 1.5,
		outerRadius: 2,
		thickness: 0.5,
		startAngle: 0,
		endAngle: Math.PI / 2,
		color: new Color(0x00ffff),
		segments: 120,
	};
	/** 上次高亮的扇环，destroy 时用它把缩放与透明度复位，避免下次挂载继承脏状态 */
	#prevMesh: Object3D | null = null;

	/** 建组、存参、立即 init；此时容器必须已有尺寸，否则相机 aspect 与画布会按 0 计算 */
	constructor(container: HTMLDivElement, option: PieOption) {
		this.#pieGroup = new Group();
		this.#container = container;
		this.#option = option;
		this.init();
	}

	/** 对外暴露场景，供调试或扩展挂载额外对象；内部用断言绕过可空类型 */
	get scene() {
		return this.#scene as Scene;
	}

	/** 对外暴露渲染器，同上，调用前需确认 init 已完成 */
	get renderer() {
		return this.#renderer as WebGLRenderer;
	}

	/**
	 * 搭建顺序有依赖：先有 scene 才能加物体，先有 renderer 才能把 canvas 塞进容器，
	 * 因此相机 → 渲染器 → 灯光 → 装饰平面 → 扇环 → 渲染循环严格串行。
	 */
	private init() {
		this.#scene = new Scene();
		this.initCamera();
		this.initRenderer();
		this.initLight();
		this.initAxes();
		this.initControls();
		this.createPlane({
			url: "/texture/pie/ring2.png",
			width: 5,
			position: new Vector3(0, 0, -0.01),
			color: "#00ffff",
		});
		this.createPlane({
			url: "/texture/pie/ring3.png",
			width: 6.5,
			position: new Vector3(0, 0, -0.02),
			color: "#00ffff",
		});
		this.createPlane({
			url: "/texture/pie/ring4.png",
			width: 5.5,
			position: new Vector3(0, 0, -0.03),
			animate: true,
			color: "#00ffff",
		});
		this.createPie();
		this.loop();
	}

	/**
	 * 透视相机：30° 视场角接近正交观感，减少近大远小的透视畸变，适合读占比。
	 * 机位固定为斜上方约 45°，远平面 1500 足够覆盖装饰圆环。
	 */
	private initCamera() {
		const { width, height } = this.#option;
		const rate = width / height;
		this.#camera = new PerspectiveCamera(30, rate, 0.1, 1500);
		// 上一版机位，保留作对照：略靠左、俯角更平
		// this.#camera.position.set(4.972679988078243, 4.643664044427053, 5.723022308725478)
		this.#camera.position.set(
			6.023813305272227,
			4.838542633695233,
			6.111272698256137,
		);
		this.#camera.lookAt(0, 0, 0);
	}

	/**
	 * 渲染器：alpha 打开让背景透明，底色交给大屏卡片的 CSS 渐变；
	 * 按 devicePixelRatio 设置像素比，高分屏下弧线才不会发毛。
	 */
	private initRenderer() {
		const { width, height } = this.#option;
		this.#renderer = new WebGLRenderer({
			antialias: true,
			alpha: true,
		});
		this.#renderer.setPixelRatio(window.devicePixelRatio);
		this.#renderer.setSize(width, height);
		this.#container.appendChild(this.#renderer.domElement);
	}

	/**
	 * 两盏强度为 2 的平行光从相反方向打，配合环境光保证扇环顶面与侧壁都有明暗层次，
	 * 避免单光源下侧壁全黑、看不出挤出厚度。
	 */
	private initLight() {
		//   平行光1
		const directionalLight1 = new DirectionalLight(0xffffff, 2);
		directionalLight1.position.set(200, 300, 200);
		//   平行光2
		const directionalLight2 = new DirectionalLight(0xffffff, 2);
		directionalLight2.position.set(-200, -300, -200);
		// 环境光
		const ambientLight = new AmbientLight(0xffffff, 2);
		// 将光源添加到场景中
		this.#scene?.add(directionalLight1);
		this.#scene?.add(directionalLight2);
		this.#scene?.add(ambientLight);
	}

	/** 坐标轴辅助对象尺寸传 0，等价于隐藏；保留实例只为在 destroy 时统一清引用 */
	private initAxes() {
		this.#axes = new AxesHelper(0);
		this.#scene?.add(this.#axes);
	}

	/**
	 * 轨道控制器：极角上限给到 PI 允许俯视到底，阻尼开启让拖拽有缓停手感。
	 * enabled 先置 false——大屏展示态不希望鼠标划过就转动；项目中没有任何地方调用 start()，
	 * 控制器因此始终保持禁用，交互逻辑只是预留。
	 */
	private initControls() {
		this.#controls = new OrbitControls(
			this.#camera as PerspectiveCamera,
			this.#renderer?.domElement,
		);
		this.#controls.maxPolarAngle = Math.PI;
		this.#controls.autoRotate = false;
		this.#controls.enableDamping = true;
		this.#controls.enabled = false;
	}

	/**
	 * 往场景里加一张躺着（朝上）的贴图平面，作为饼图背后的装饰圆环。
	 * depthTest 关掉后这些平面不再参与深度比较，叠放顺序完全由 z 值决定，
	 * 因此三层圆环可以用 -0.01 / -0.02 / -0.03 的微小间隔稳定地压在最底层。
	 */
	private createPlane(opt: Partial<PlaneOption>) {
		const option = Object.assign(this.#defaultPlaneOption, opt);
		const geometry = new PlaneGeometry(option.width, option.width);
		const material = new MeshBasicMaterial({
			map: this.getTexture(option.url),
			// color: 0x00ffff,
			transparent: true,
			side: DoubleSide,
			// depthWrite: false,
			depthTest: false,
		});
		if (option.color) {
			material.color = new Color(option.color);
		}
		const mesh = new Mesh(geometry, material);
		mesh.position.copy(option.position);
		// 平面默认立在 XY 平面，绕 x 轴转 -90° 后躺平到 XZ 平面，正面朝上正对相机
		mesh.rotation.x = (-1 * Math.PI) / 2;
		if (option.animate) {
			// 每 3 秒转满一圈、linear 且无限循环，纯匀速扫光；角度走 z 轴是因为平面已被转平
			gsap.to(mesh.rotation, {
				z: 2 * Math.PI,
				repeat: -1,
				ease: "none",
				duration: 3,
			});
		}
		this.#scene?.add(mesh);
	}

	/** 加载贴图并设为重复采样，贴图返回后才异步可用，因此首帧可能短暂无纹理 */
	private getTexture(url: string) {
		const texture = new TextureLoader().load(url);
		texture.wrapS = texture.wrapT = RepeatWrapping;
		return texture;
	}

	/**
	 * 按数据占比切分整圆：每个扇区占 2π × value / count 弧度，从局部坐标的 +x 轴起依次排开。
	 * 扇区之间各留 0.0001 弧度的缝，避免相邻面共面产生 z-fighting 闪烁。
	 * 注意 endAngle 是逐段累加且每段都多减了 0.0001，末尾会累计 n × 0.0001 弧度的收缩，
	 * 当前数据量级下肉眼不可见，但数据项很多时需要留意。
	 */
	private createPie() {
		let startAngle = 0;
		let endAngle = 0;
		const { count, data, colors } = this.#option;
		for (let i = 0; i < data.length; i++) {
			// 占比以 count（各 value 之和）为分母，因此 count 必须与 data 同源，否则扇区合不拢整圆
			const percent = data[i].value / count;
			if (i === 0) {
				startAngle = 0;
			} else {
				startAngle = endAngle + 0.0001;
			}
			endAngle = endAngle + 2 * Math.PI * percent - 0.0001;

			const ring = this.addRing({
				startAngle: startAngle,
				endAngle: endAngle,
				// 颜色池取模，数据项多于配色时循环复用，避免 undefined 传入 Color 报错
				color: new Color(colors[i % colors.length]),
			});
			ring.name = `ring${i}`;
			this.#pieGroup.add(ring);
		}
		this.#scene?.add(this.#pieGroup);
		// 首次不播放上一块的复位动画，直接让第 0 块处于高亮态
		this.chooseRing(this.#activeIndex, true);
		this.#timer = setInterval(() => {
			this.loopChange();
		}, this.#option.delay);
	}

	/**
	 * 用「外弧正绘 + 内弧反绘」拼出闭合的扇环轮廓，再挤出 thickness 得到有厚度的 3D 扇区。
	 * 返回的 mesh 已归一化到水平放置（rotation.x = -90°），调用方只需关心角度与颜色。
	 */
	private addRing(opt: Partial<RingOption>) {
		const option = Object.assign(this.#defaultRingOption, opt);
		// 外层
		const outerShape = new Shape();
		outerShape.arc(
			0,
			0,
			option.outerRadius,
			option.startAngle,
			option.endAngle,
		);
		const outerPoints = outerShape.getPoints(option.segments);
		// 内层：需要把开始结束角度调换下，并反向绘制
		const innerShape = new Shape();
		innerShape.arc(
			0,
			0,
			option.innerRadius,
			option.endAngle,
			option.startAngle,
			true,
		);
		const innerPoints = innerShape.getPoints(option.segments);
		// 组合内外侧的点，并重新生成shape
		const shape = new Shape(outerPoints.concat(innerPoints));
		// 扩展设置：depth 即扇环厚度（世界坐标单位），bevel 全为 0 得到干净的直角侧壁
		const extrudeSettings = {
			steps: 1,
			depth: option.thickness,
			bevelEnabled: true,
			bevelThickness: 0,
			bevelSize: 0,
			bevelOffset: 0,
			bevelSegments: 0,
		};
		const extruGeometry = new ExtrudeGeometry(shape, extrudeSettings);
		const material = new MeshLambertMaterial({
			color: option.color,
			transparent: true,
			opacity: this.#option.opacity,
			side: DoubleSide,
		});
		// clone 材质：高亮时要单独 tween 这一块的 opacity，共用同一实例会让所有扇区一起变
		const mesh = new Mesh(extruGeometry, material.clone());
		// renderOrder 抬到装饰平面之上，确保半透明扇环不会被贴图盖住
		mesh.renderOrder = 10;
		// 同样躺平到水平面，挤出方向（局部 z）随之变为世界坐标的竖直方向
		mesh.rotation.x = (-1 * Math.PI) / 2;
		return mesh;
	}

	/** 启动渲染循环：setAnimationLoop 与浏览器刷新率同步，后台标签页会自动暂停 */
	private loop() {
		this.#renderer?.setAnimationLoop(() => {
			this.#renderer?.render(this.#scene as Scene, this.#camera as ThreeCamera);
			this.#controls?.update();
			// console.log(this.camera .position);
		});
	}

	/**
	 * 轮播推进一步：下标 +1，越界则回到 0 并触发 loopComplete（此时才算走完一轮）。
	 * 先回调 onChange 再切换高亮，保证中心文字与扇环动画同帧开始。
	 */
	private loopChange() {
		let index = this.#activeIndex + 1;

		if (index >= this.#option.data.length) {
			index = 0;
			this.#option.loopComplete?.();
		}
		this.#option?.onChange?.(index);
		this.chooseRing(index);
	}

	/**
	 * 切换高亮扇区：新块沿挤出方向放大到 2 倍厚度、透明度提到 0.8，旧块复位。
	 * 因为扇环已躺平，scale.z 放大的是厚度而非长度，俯视时看起来是扇区向上鼓起。
	 * 用 gsap 默认时长与默认缓动（约 0.5s、power1.out）做补间，比切换材质颜色更自然。
	 * @param activeIndex 要激活的扇区下标
	 * @param isFirst 首次初始化，此时不需要（也不该）播放旧块的复位动画
	 */
	private chooseRing(activeIndex = 0, isFirst = false) {
		const prevIndex =
			activeIndex - 1 < 0 ? this.#option.data.length - 1 : activeIndex - 1;
		const prevMesh = this.#pieGroup.children[prevIndex];
		this.#prevMesh = prevMesh;
		this.#activeIndex = activeIndex;
		const chooseMesh = this.#pieGroup.children[activeIndex];
		if (!isFirst) {
			if (prevMesh instanceof Mesh) {
				gsap.to(prevMesh?.scale, { z: 1 });
				gsap.to(prevMesh.material, { opacity: this.#option.opacity });
			}
		}
		gsap.to(chooseMesh.scale, { z: 2 });
		gsap.to((chooseMesh as Mesh).material, { opacity: 0.8 });
	}

	/**
	 * 恢复播放并允许拖拽。
	 * 注意 init 阶段已用同一 delay 起过一枚定时器，这里再起一枚会覆盖 #timer 引用，
	 * 旧定时器就失去句柄无法被 clear；因此只在需要手动重启时调用，且调用前应先 stop。
	 */
	start() {
		this.loop();
		(this.#controls as OrbitControls).enabled = true;
		this.#timer = setInterval(() => {
			this.loopChange();
		}, this.#option.delay);
	}

	/** 暂停轮播并断开渲染循环（传 null 停掉 setAnimationLoop），场景对象仍保留可再次 start */
	stop() {
		this.#timer && clearInterval(this.#timer);
		if (this.#controls) {
			this.#controls.enabled = false;
		}
		if (this.#renderer) {
			this.#renderer.setAnimationLoop(null);
		}
	}

	/**
	 * 跟随容器尺寸重算：先改相机 aspect 并 updateProjectionMatrix（否则只是画布拉伸、画面变形），
	 * 再按新的 offsetWidth / offsetHeight 重设渲染器尺寸与像素比。
	 * 组件没有自带 window resize 监听，需要由外部在容器变化时手动调用。
	 */
	resize() {
		const { offsetWidth, offsetHeight } = this.#container;
		this.#option.width = offsetWidth;
		this.#option.height = offsetHeight;
		const aspect = offsetWidth / offsetHeight;
		(this.#camera as PerspectiveCamera).aspect = aspect;
		this.#camera?.updateProjectionMatrix();
		this.#renderer?.setSize(offsetWidth, offsetHeight);
		this.#renderer?.setPixelRatio(window.devicePixelRatio);
	}

	/**
	 * 彻底回收：只把 #prevMesh（上一个高亮块）复位成非高亮态，当前仍处高亮的扇区不会被还原，
	 * 复位后停定时器与渲染循环、释放 WebGL 上下文、销毁轨道控制器，最后移走 canvas 并清空引用。
	 * forceContextLoss 是必要的——浏览器同时允许的 WebGL 上下文数量有限，
	 * 大屏反复切换页面时不清会导致后续 init 拿不到上下文。
	 */
	destroy() {
		if (this.#prevMesh) {
			gsap.set(this.#prevMesh.scale, { z: 1 });
			gsap.set((this.#prevMesh as Mesh).material, {
				opacity: this.#option.opacity,
			});
		}
		this.stop();
		// 这里的匿名函数每次都是新引用，和任何已注册的监听都不相等，因此实际解绑不到东西；
		// 本组件也从未注册 window resize，尺寸更新依赖外部显式调用 resize
		window.removeEventListener("resize", () => {
			this.resize();
		});
		if (this.#renderer) {
			emptyObject(this.#pieGroup);
			this.#renderer.dispose();
			this.#renderer.forceContextLoss();
			this.#controls?.dispose();
			this.#container.removeChild(this.#renderer.domElement);
			this.#scene = null;
			this.#camera = null;
			this.#renderer = null;
			this.#controls = null;
			this.#axes = null;
		}
	}
}

/** PieChart 组件的 props，语义与 PieOption 基本一一对应，差值（宽高、count）由组件自行推导。 */
interface PieProps {
	/** 追加到最外层容器的 class，用于控制卡片内的占位尺寸 */
	class?: string;
	/** 扇区数据，单位为亿元时 value 与 count 同量级；默认空数组则不会建任何扇环 */
	/** @default [] */
	data?: {
		name: string;
		value: number;
	}[];
	/** 扇区配色池，可写十六进制字符串或 0x 数字，超出长度后取模循环 */
	/** @default [0x20faae, 0xeab108, 0x2fa4e7, 0x00ffff, 0xfc5430] */
	colors?: (string | number)[];
	/** 非高亮扇区的基础不透明度，0~1，高亮块固定 0.8 */
	/** @default 0.5 */
	opacity?: number;
	/** 每个扇区的停留时长（ms），同时作为轮播定时器间隔 */
	/** @default 5000 */
	delay?: number;
	/** 一轮轮播回到第一个扇区时的回调，可用于让外部文案循环播放 */
	loopComplete?: () => void;
	/** 中心内容渲染函数，入参为当前扇区数据并附带总和 count，用于算百分比 */
	children?: (
		val: NonNullable<PieProps["data"]>[number] & { count: number },
	) => JSXElement;
}

/**
 * 3D 环形饼图组件：只负责按容器尺寸创建 Pie 实例并转发数据，渲染逻辑全在 class Pie 内。
 *
 * - props 不具响应性：data / colors / delay 在 onMount 时被快照进 Pie，之后修改 props 不会重建图表；
 *   想换数据只能让父级改变容器尺寸触发重挂载（resize 只更新相机与渲染器尺寸，不会重建场景）。
 * - 生命周期：onMount 时 new Pie（内部即开始渲染与轮播），onCleanup 时 destroy 释放 WebGL 上下文与定时器。
 * - 尺寸：组件不监听 window resize，Pie.resize 需外部驱动。
 * - 中心文案通过 activeIndex 信号随轮播更新。
 */
export default function PieChart({
	class: className = "",
	data = [],
	colors = [0x20faae, 0xeab108, 0x2fa4e7, 0x00ffff, 0xfc5430],
	opacity = 0.5,
	delay = 5000,
	children,
}: PieProps) {
	let pieDom!: HTMLDivElement;
	// 当前高亮下标，由 Pie 的 onChange 回写；读取方只有中心文案，因此单独用一个信号即可
	const [activeIndex, setActiveIndex] = createSignal<number>(0);
	// 总和作为百分比分母，必须是纯数值累加（reduce 给 0 作初值，空数组时为 0）
	const count = data
		.map((item) => item.value)
		.reduce((prev, current) => prev + current, 0);

	let pie: Pie | null = null;
	// 必须等 DOM 有尺寸后再建场景：相机 aspect 与渲染器尺寸都取 offsetWidth / offsetHeight
	onMount(() => {
		const { offsetWidth, offsetHeight } = pieDom;
		pie = new Pie(pieDom, {
			width: offsetWidth,
			height: offsetHeight,
			count,
			data,
			colors,
			opacity,
			delay,
			// 轮播切块时同步中心文案，避免文字与高亮扇区错位
			onChange: setActiveIndex,
		});
	});
	// 组件卸载即销毁实例，否则定时器与 WebGL 上下文会随大屏切页累积泄漏
	onCleanup(() => {
		pie?.destroy();
		pie = null;
	});

	// 两层结构：底层 div 给 Three.js 挂 canvas，上层是绝对定位的中心文案；
	// 文案层 pointer-events-none，让鼠标事件穿透到 canvas，OrbitControls 才能拖拽，
	// 需要点击时由调用方在更外层单独恢复 pointer-events-auto
	return (
		<div class={`tw:relative tw:size-full tw:z-2 ${className}`}>
			<div class="tw:size-full" ref={pieDom}></div>
			<div
				class={cn(
					"tw:absolute tw:top-0 tw:left-0",
					"tw:flex tw:justify-center tw:items-center",
					"tw:size-full tw:pointer-events-none",
				)}
			>
				{children?.({ ...data[activeIndex()], count })}
			</div>
		</div>
	);
}

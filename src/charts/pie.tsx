import gsap from "gsap";
import { createSignal, type JSXElement, onMount } from "solid-js";
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
import "./pie.css";

interface PieOption {
	width: number;
	height: number;
	count: number;
	data: Array<{ name: string; value: number }>;
	colors: Array<string | number>;
	opacity: number;
	delay: number;
	loopComplete?: () => void;
	onChange?: (index: number) => void;
}

type PlaneOption = {
	url: string;
	width: number;
	z: number;
	position: Vector3;
	animate: boolean;
	color: string | null;
};

type RingOption = {
	/** 内圆半径 */
	innerRadius: number;
	/** 外圈半径 */
	outerRadius: number;
	/** 厚度 */
	thickness: number;
	startAngle: number;
	endAngle: number;
	color: Color;
	segments: number;
};

class Pie {
	#pieGroup: Group;
	#container: HTMLDivElement;
	#option: PieOption;
	#scene: Scene | null = null;
	#camera: PerspectiveCamera | null = null;
	#renderer: WebGLRenderer | null = null;
	#axes: AxesHelper | null = null;
	#controls: OrbitControls | null = null;
	#timer: ReturnType<typeof setInterval> | null = null;
	#activeIndex = 0;

	readonly #defaultPlaneOption: PlaneOption = {
		url: "texture/ring1.png",
		width: 5.5,
		z: 0,
		position: new Vector3(0, 0, 0),
		animate: false,
		color: null,
	};
	readonly #defaultRingOption: RingOption = {
		innerRadius: 1.5,
		outerRadius: 2,
		thickness: 0.5,
		startAngle: 0,
		endAngle: Math.PI / 2,
		color: new Color(0x00ffff),
		segments: 120,
	};
	#prevMesh: Object3D | null = null;

	constructor(container: HTMLDivElement, option: PieOption) {
		this.#pieGroup = new Group();
		this.#container = container;
		this.#option = option;
		this.init();
	}

	get scene() {
		return this.#scene as Scene;
	}

	get renderer() {
		return this.#renderer as WebGLRenderer;
	}

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

	private initCamera() {
		const { width, height } = this.#option;
		const rate = width / height;
		this.#camera = new PerspectiveCamera(30, rate, 0.1, 1500);
		// this.#camera.position.set(4.972679988078243, 4.643664044427053, 5.723022308725478)
		this.#camera.position.set(
			6.023813305272227,
			4.838542633695233,
			6.111272698256137,
		);
		this.#camera.lookAt(0, 0, 0);
	}

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

	private initAxes() {
		this.#axes = new AxesHelper(0);
		this.#scene?.add(this.#axes);
	}

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
		mesh.rotation.x = (-1 * Math.PI) / 2;
		if (option.animate) {
			gsap.to(mesh.rotation, {
				z: 2 * Math.PI,
				repeat: -1,
				ease: "none",
				duration: 3,
			});
		}
		this.#scene?.add(mesh);
	}

	private getTexture(url: string) {
		const texture = new TextureLoader().load(url);
		texture.wrapS = texture.wrapT = RepeatWrapping;
		return texture;
	}

	private createPie() {
		let startAngle = 0;
		let endAngle = 0;
		const { count, data, colors } = this.#option;
		for (let i = 0; i < data.length; i++) {
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
				color: new Color(colors[i % colors.length]),
			});
			ring.name = `ring${i}`;
			this.#pieGroup.add(ring);
		}
		this.#scene?.add(this.#pieGroup);
		this.chooseRing(this.#activeIndex, true);
		this.#timer = setInterval(() => {
			this.loopChange();
		}, this.#option.delay);
	}

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
		// 扩展设置
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
		const mesh = new Mesh(extruGeometry, material.clone());
		mesh.renderOrder = 10;
		mesh.rotation.x = (-1 * Math.PI) / 2;
		return mesh;
	}

	private loop() {
		this.#renderer?.setAnimationLoop(() => {
			this.#renderer?.render(this.#scene as Scene, this.#camera as ThreeCamera);
			this.#controls?.update();
			// console.log(this.camera .position);
		});
	}

	private loopChange() {
		let index = this.#activeIndex + 1;

		if (index >= this.#option.data.length) {
			index = 0;
			this.#option.loopComplete?.();
		}
		this.#option?.onChange?.(index);
		this.chooseRing(index);
	}

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

	start() {
		this.loop();
		(this.#controls as OrbitControls).enabled = true;
		this.#timer = setInterval(() => {
			this.loopChange();
		}, this.#option.delay);
	}

	stop() {
		this.#timer && clearInterval(this.#timer);
		if (this.#controls) {
			this.#controls.enabled = false;
		}
		if (this.#renderer) {
			this.#renderer.setAnimationLoop(null);
		}
	}

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

	destroy() {
		if (this.#prevMesh) {
			gsap.set(this.#prevMesh.scale, { z: 1 });
			gsap.set((this.#prevMesh as Mesh).material, {
				opacity: this.#option.opacity,
			});
		}
		this.stop();
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

interface PieProps {
	class?: string;
	/** @default [] */
	data?: {
		name: string;
		value: number;
	}[];
	/** @default [0x20faae, 0xeab108, 0x2fa4e7, 0x00ffff, 0xfc5430] */
	colors?: (string | number)[];
	/** @default 0.5 */
	opacity?: number;
	/** @default 5000 */
	delay?: number;
	loopComplete?: () => void;
	children?: (
		val: NonNullable<PieProps["data"]>[number] & { count: number },
	) => JSXElement;
}

export default function PieChart({
	class: className = "",
	data = [],
	colors = [0x20faae, 0xeab108, 0x2fa4e7, 0x00ffff, 0xfc5430],
	opacity = 0.5,
	delay = 5000,
	children,
}: PieProps) {
	let pieDom!: HTMLDivElement;
	const [activeIndex, setActiveIndex] = createSignal<number>(0);
	const count = data
		.map((item) => item.value)
		.reduce((prev, current) => prev + current, 0);

	onMount(() => {
		const { offsetWidth, offsetHeight } = pieDom;
		new Pie(pieDom, {
			width: offsetWidth,
			height: offsetHeight,
			count,
			data,
			colors,
			opacity,
			delay,
			onChange: setActiveIndex,
		});
	});

	return (
		<div class={`three-pie-wrap ${className}`}>
			<div class="three-pie" ref={pieDom}></div>
			<div class="three-pie-slot">
				{children?.({ ...data[activeIndex()], count })}
			</div>
		</div>
	);
}

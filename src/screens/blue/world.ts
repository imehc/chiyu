import { geoMercator } from "d3-geo";
import type {
	Feature,
	FeatureCollection,
	MultiPolygon,
	Polygon,
	Position,
} from "geojson";
import gsap from "gsap";
import {
	AdditiveBlending,
	AmbientLight,
	BufferGeometry,
	CanvasTexture,
	Color,
	DirectionalLight,
	DoubleSide,
	EdgesGeometry,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Group,
	HalfFloatType,
	Line,
	LineBasicMaterial,
	LineLoop,
	LineSegments,
	type Material,
	type Object3D,
	Mesh,
	MeshBasicMaterial,
	MeshPhongMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Points,
	PointsMaterial,
	QuadraticBezierCurve3,
	Raycaster,
	RepeatWrapping,
	Scene,
	ShaderMaterial,
	Shape,
	ShapeGeometry,
	SphereGeometry,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
	TorusGeometry,
	Vector2,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import chinaInfoPoints from "../china/data/info";
import { chinaRegions } from "../china/data/regions";
import chinaScatterPoints from "../china/data/scatter";
import CloudTransition from "./cloud-transition";
import GlobeFreight, { type FreightMode } from "./freight";
import LayerMotion from "./layer-motion";
import MapEffects from "./map-effects";

type Layer =
	| "flyline"
	| "label"
	| "point"
	| "scatter"
	| "heat"
	| "region"
	| "scan";
type View = "china" | "globe";
type MapFeature = Feature<Polygon | MultiPolygon>;

export interface MonitoringPoint {
	name: string;
	x: number;
	y: number;
}

interface BlueWorldCallbacks {
	onRegion?: (name: string) => void;
	onMonitoringPoint?: (point: MonitoringPoint | null) => void;
	onReady?: () => void;
	onViewChange?: (view: View) => void;
	onTransitionChange?: (active: boolean) => void;
	onViewMotionChange?: (phase: "idle" | "exit" | "enter") => void;
	onDrillChange?: (path: string[]) => void;
}

const GLOBE_HOME = { x: 0.43, y: Math.PI + 0.12, z: 0.04 };
const CHINA_GLOBE_FOCUS = { x: 0.59, y: Math.PI - 0.27, z: 0 };
const GLOBE_ORBIT_RADIUS = 7.25;
const GLOBE_SCAN_RADIUS = 5.9;
const CHINA_MAP_DEPTH = 0.48;
const CHINA_ENTRANCE_DELAY = 0.65;
const REGION_TRANSITION_DURATION = 1.8;

interface MapCameraPose {
	target: Vector3;
	zoom: number;
	pitch: number;
	yaw: number;
	rotation: number;
	rotationCenter: Vector2;
	topView: boolean;
}

interface RegionGeometryTransition {
	outgoing: Group[];
	outgoingAccents: { object: Object3D; visible: boolean }[];
	saved: { object: Object3D; parent: Object3D }[];
	retired: Set<Object3D>;
	incoming: Object3D[];
	incomingLabels: Object3D[];
	depthObjects: { object: Object3D; scaleZ: number; positionZ: number }[];
	fromDepth: number;
	depthRatio: number;
	depthOffset: number;
	progress: number;
	frozenLabels: Set<Object3D>;
	groupOrders: { group: Group; order: number }[];
	effectsFromPosition: Vector3;
	effectsFromScale: Vector3;
	effectsToPosition?: Vector3;
	effectsToScale?: Vector3;
}

const smoothProgress = (value: number) => {
	const progress = Math.min(1, Math.max(0, value));
	return progress * progress * (3 - 2 * progress);
};

interface ChinaEntranceState {
	timeline?: gsap.core.Timeline;
	objects: {
		object: import("three").Object3D;
		scaleZ: number;
		positionZ: number;
	}[];
	materials: {
		material: Material;
		opacity: number;
		transparent: boolean;
		depthWrite: boolean;
	}[];
}

const shortName = (name: string) =>
	name
		.replace("维吾尔自治区", "")
		.replace("壮族自治区", "")
		.replace("回族自治区", "")
		.replace("自治区", "")
		.replace("特别行政区", "")
		.replace(/[省市]$/, "");

const polygonsOf = (feature: MapFeature): Position[][][] =>
	feature.geometry.type === "Polygon"
		? [feature.geometry.coordinates]
		: feature.geometry.coordinates;

/** Rebuilds the reference map while fitting the current viewport. */
export default class BlueWorld {
	private readonly canvas: HTMLCanvasElement;
	private readonly callbacks: BlueWorldCallbacks;
	private readonly scene = new Scene();
	private readonly camera = new PerspectiveCamera(36, 2.3, 0.1, 300);
	private readonly renderer: WebGLRenderer;
	private readonly composer: EffectComposer;
	private readonly resizeObserver: ResizeObserver;
	private readonly abortController = new AbortController();
	private readonly projection = geoMercator()
		.center([104.3, 35.7])
		.scale(14)
		.translate([0, 0]);
	private readonly map = new Group();
	private readonly chinaRoot = new Group();
	private readonly globe = new Group();
	private readonly globeEffects = new Group();
	private readonly layerMotion = new LayerMotion();
	private readonly regionReveal = new LayerMotion();
	private regionTransition: RegionGeometryTransition | undefined;
	private regionRequest = 0;
	private pendingRegionBack = false;
	private readonly layerEnabled: Record<Layer, boolean> = {
		flyline: false,
		label: false,
		point: false,
		scatter: false,
		heat: false,
		region: false,
		scan: false,
	};
	private readonly cloudTransition = new CloudTransition();
	private readonly labels = new Group();
	private readonly layers: Record<Layer, Group> = {
		flyline: new Group(),
		label: new Group(),
		point: new Group(),
		scatter: new Group(),
		heat: new Group(),
		region: new Group(),
		scan: new Group(),
	};
	private readonly globeLayers: Record<Layer, Group> = {
		flyline: new Group(),
		label: new Group(),
		point: new Group(),
		scatter: new Group(),
		heat: new Group(),
		region: new Group(),
		scan: new Group(),
	};
	private readonly cityDataCache = new Map<
		number,
		FeatureCollection<Polygon | MultiPolygon>
	>();
	private readonly raycaster = new Raycaster();
	private readonly pointer = new Vector2();
	private readonly regionMeshes: Mesh[] = [];
	private readonly detailMeshes: Mesh[] = [];
	private readonly surfaceLabels: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
	private readonly contextViewport = new Vector2();
	private mapLabelOpacity = 0;
	private labelTween: gsap.core.Tween | undefined;
	private readonly drillPath: MapFeature[] = [];
	private readonly drillViews: MapCameraPose[] = [];
	private readonly mapRotationCenter = new Vector2();
	private detailLoading = false;
	private freight: GlobeFreight | undefined;
	private readonly mapEffects = new MapEffects();
	private chinaReady = false;
	private chinaLoadPromise: Promise<void> | undefined;
	private loadingView = false;
	private viewLoadRequest = 0;
	private readonly surrounding = new Group();
	private readonly monitoringMarkers: Sprite[] = [];
	private activeMonitoringMarker: Sprite | undefined;
	private monitoringPosition: MonitoringPoint | undefined;
	private readonly monitoringProjection = new Vector3();
	private readonly monitoringScale = new Vector3();
	private readonly monitoringOffset = new Vector3();
	private readonly orbitRing = new Group();
	private readonly background = new Group();
	private readonly disposableTextures = new Set<Texture>();
	private readonly sharedTextures = new Set<Texture>();
	private readonly glowTextures = new Map<string, Texture>();
	private readonly sideMaterials = new Set<ShaderMaterial>();
	private readonly bodyReveal = { value: 1 };
	private chinaEntrance: ChinaEntranceState | undefined;

	private readonly alertAnimations: {
		point: Group;
		body: Group;
		pulse: Mesh<PlaneGeometry, ShaderMaterial>;
		label: Mesh<PlaneGeometry, MeshBasicMaterial>;
		edge: Line<BufferGeometry, LineBasicMaterial>;
		scale: number;
		offset: number;
	}[] = [];
	private chinaData: FeatureCollection<Polygon | MultiPolygon> | undefined;
	private chinaOutline: FeatureCollection<Polygon | MultiPolygon> | undefined;
	private globeMesh: Mesh | undefined;
	private globeClouds: Mesh<SphereGeometry, ShaderMaterial> | undefined;
	private globeScan: Mesh<SphereGeometry, ShaderMaterial> | undefined;
	private globeFloatingRing: Mesh<PlaneGeometry, ShaderMaterial> | undefined;
	private globeRadiance: Sprite | undefined;
	private readonly reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);
	private sideTexture: Texture | undefined;
	private transitionTimeline: gsap.core.Timeline | undefined;
	private zoomTween: gsap.core.Tween | undefined;
	private angleTween: gsap.core.Tween | undefined;
	private zoomTarget: number | undefined;
	private viewTimeline: gsap.core.Timeline | undefined;
	private detailTimeline: gsap.core.Timeline | undefined;
	private hoverMesh: Mesh | undefined;
	private animationFrame = 0;
	private started = performance.now();
	private previousFrameTime = this.started;
	private destroyed = false;
	private view: View = "china";
	private requestedView: View = this.view;
	private viewMix = 0;
	private globeLabelOpacity = 0;
	private switchingView = false;
	private viewEntranceActive = false;
	private ready = false;
	private readonly detailHomeTarget = new Vector3();
	private readonly globePulseRings: Mesh[] = [];
	private zoomLevel = 1;
	private detailZoom = 1;
	private topView = false;
	private cameraPitch = 0.72;
	private cameraYaw = 0;
	private mapRotation = 0;
	private selectedRegion: string | undefined;
	private drilledLabels: Group | undefined;
	private drilledPoints: Group | undefined;
	private drilledLayers: Partial<Record<Layer, Group>> = {};
	private cameraDistance = 34;
	private readonly target = new Vector3(0.35, 0, 0);
	private dragStart: { x: number; y: number; moved: boolean } | undefined;

	constructor(canvas: HTMLCanvasElement, callbacks: BlueWorldCallbacks = {}) {
		this.canvas = canvas;
		this.callbacks = callbacks;
		this.renderer = new WebGLRenderer({
			canvas,
			alpha: false,
			antialias: true,
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = SRGBColorSpace;
		this.composer = new EffectComposer(
			this.renderer,
			new WebGLRenderTarget(1, 1, {
				type: HalfFloatType,
				samples: Math.min(4, this.renderer.capabilities.maxSamples),
			}),
		);
		this.composer.setPixelRatio(this.renderer.getPixelRatio());
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.composer.addPass(
			new UnrealBloomPass(new Vector2(1280, 556), 0.34, 0.22, 1.12),
		);
		this.composer.addPass(new OutputPass());
		this.scene.background = new Color("#020a17");
		this.scene.add(new AmbientLight(0xd4e8ff, 1.15));
		const sunlight = new DirectionalLight(0xe5f4ff, 3.2);
		sunlight.position.set(8, 9, 5);
		this.scene.add(sunlight);
		this.map.rotation.x = -Math.PI / 2;
		this.map.position.y = 0.16;
		this.labels.rotation.x = -Math.PI / 2;
		this.labels.position.copy(this.map.position);
		this.chinaRoot.add(this.background, this.map, this.labels, this.orbitRing);
		this.scene.add(this.chinaRoot, this.globe, this.globeEffects);
		this.chinaRoot.visible = true;
		Object.values(this.layers).forEach((group) => {
			group.rotation.x = -Math.PI / 2;
			group.position.copy(this.map.position);
			this.chinaRoot.add(group);
		});
		this.layers.heat.visible = false;
		this.layers.flyline.visible = false;
		this.layers.label.visible = false;
		this.layers.point.visible = false;
		this.layers.scatter.visible = false;
		this.layers.region.visible = false;
		this.globe.visible = false;
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas.parentElement ?? canvas);
		this.resize();
		window.addEventListener("resize", this.resize);
		canvas.addEventListener("pointermove", this.onPointerMove);
		canvas.addEventListener("pointerdown", this.onPointerDown);
		canvas.addEventListener("pointerup", this.onPointerUp);
		canvas.addEventListener("pointerleave", this.onPointerLeave);
		canvas.addEventListener("wheel", this.onWheel, { passive: false });
		this.animate();
		void this.load();
	}

	private point(coordinates: [number, number], height = 0.32) {
		// GeoJSON rounding can put 180° just past the projection's wrap boundary.
		const longitude = Math.max(-180, Math.min(180, coordinates[0]));
		const projected = this.projection([longitude, coordinates[1]]) as [
			number,
			number,
		];
		return new Vector3(projected[0], -projected[1], height);
	}

	private async readMap(name: string) {
		const response = await fetch(`/geojson/${name}`, {
			signal: this.abortController.signal,
		});
		if (!response.ok) throw new Error(`地图资源读取失败: ${name}`);
		return (await response.json()) as FeatureCollection<Polygon | MultiPolygon>;
	}

	private async load() {
		try {
			const [china, outline, world] = await Promise.all([
				this.readMap("blue/100000.json"),
				this.readMap("blue/100000-outline.json"),
				this.readMap("world.json"),
			]);
			if (this.destroyed) return;
			this.chinaData = china;
			this.chinaOutline = outline;
			await this.createGlobe(world, china, outline);
			if (this.destroyed) return;
			this.ready = true;
			if (this.requestedView === "china") await this.ensureChina();
			if (this.destroyed) return;
			if (!this.chinaReady) this.warmViews();
			this.resize();
			this.applyView(this.requestedView);
			if (this.view === "china") {
				this.playChinaEntrance();
			} else {
				this.zoomLevel = 0.72;
				if (this.globeMesh) this.globeMesh.rotation.y = GLOBE_HOME.y - 0.5;
				this.updateCamera();
				this.transitionCamera(this.target.clone(), 1, 2.4, 0.25);
				if (this.globeMesh)
					this.transitionTimeline?.to(
						this.globeMesh.rotation,
						{ ...GLOBE_HOME, duration: 2.4, ease: "power2.out" },
						0,
					);
			}
			this.callbacks.onViewChange?.(this.view);
			this.callbacks.onReady?.();
		} catch (error) {
			if (!this.destroyed) {
				console.error("蓝色大屏地图加载失败", error);
				this.callbacks.onReady?.();
			}
		}
	}

	private ensureChina() {
		if (this.chinaLoadPromise) return this.chinaLoadPromise;
		this.chinaLoadPromise = (async () => {
			const china = this.chinaData,
				outline = this.chinaOutline;
			if (!china || !outline) throw new Error("中国地图基础轮廓尚未加载");
			const [countriesResult, sideResult, effectsResult] =
				await Promise.allSettled([
					this.readMap("世界-周边.json"),
					new TextureLoader().loadAsync("/texture/side.png"),
					this.mapEffects.load(),
				]);
			if (sideResult.status === "rejected") throw sideResult.reason;
			const side = sideResult.value;
			if (countriesResult.status === "rejected") {
				side.dispose();
				throw countriesResult.reason;
			}
			if (effectsResult.status === "rejected") {
				side.dispose();
				throw effectsResult.reason;
			}
			const countries = countriesResult.value;
			if (this.destroyed) {
				side.dispose();
				return;
			}
			side.colorSpace = SRGBColorSpace;
			side.wrapS = side.wrapT = RepeatWrapping;
			this.sideTexture = side;
			this.disposableTextures.add(side);
			for (const texture of this.mapEffects.sharedTextures)
				this.sharedTextures.add(texture);
			this.map.add(this.mapEffects.group);
			this.createSurrounding(countries);
			this.createChina(china, outline);
			this.createCityMarkers();
			this.createScatter();
			this.createHeat();
			this.createFlylines();
			this.warmViews();
			this.chinaReady = true;
		})();
		return this.chinaLoadPromise;
	}

	private warmViews() {
		// First-use uploads and shader compilation belong in loading, not the cloud wipe.
		const warmScene = this.scene.clone();
		warmScene.traverse((object) => {
			object.visible = true;
		});
		const previous = this.renderer.getRenderTarget();
		const target = new WebGLRenderTarget(1, 1);
		try {
			this.renderer.setRenderTarget(target);
			this.renderer.compile(warmScene, this.camera);
			for (const texture of new Set([
				...this.disposableTextures,
				...this.sharedTextures,
			]))
				this.renderer.initTexture(texture);
			this.renderer.render(warmScene, this.camera);
			this.cloudTransition.progress.value = 0.5;
			this.cloudTransition.render(this.renderer, this.camera);
		} finally {
			this.cloudTransition.clear();
			this.renderer.setRenderTarget(previous);
			target.dispose();
			warmScene.clear();
		}
	}

	private resize = () => {
		const bounds = this.canvas.getBoundingClientRect();
		const width = Math.max(Math.round(bounds.width), 1);
		const height = Math.max(Math.round(bounds.height), 1);
		const pixelRatio = Math.min(window.devicePixelRatio, 2);
		if (this.renderer.getPixelRatio() !== pixelRatio) {
			this.renderer.setPixelRatio(pixelRatio);
			this.composer.setPixelRatio(pixelRatio);
		}
		this.renderer.setSize(width, height, false);
		this.renderer.getDrawingBufferSize(this.contextViewport);
		this.composer.setSize(width, height);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		// China spans ~15 map units and 40% of the source video width.
		this.cameraDistance =
			15.3 / (0.4212 * this.camera.aspect * 2 * Math.tan((36 * Math.PI) / 360));
		this.updateCamera();
	};

	private globeCameraDistance() {
		const diameterFraction = Math.min(0.73, this.camera.aspect * 0.36);
		const tangent = Math.tan((36 * Math.PI) / 360) * diameterFraction;
		return 5.1 * Math.sqrt(1 + 1 / tangent ** 2);
	}

	private updateCamera() {
		const globeDistance = this.globeCameraDistance();
		const chinaDistance = this.cameraDistance / this.zoomLevel;
		const distance =
			chinaDistance * (1 - this.viewMix) +
			(globeDistance / this.zoomLevel) * this.viewMix;
		const pitch = this.cameraPitch;
		const horizontalDistance = chinaDistance * Math.cos(pitch);
		this.camera.position.set(
			(this.target.x + horizontalDistance * Math.sin(this.cameraYaw)) *
				(1 - this.viewMix),
			(this.target.y + chinaDistance * Math.sin(pitch)) * (1 - this.viewMix) +
				0.5 * this.viewMix,
			(this.target.z + horizontalDistance * Math.cos(this.cameraYaw)) *
				(1 - this.viewMix) +
				(globeDistance / this.zoomLevel) * this.viewMix,
		);
		this.camera.near = Math.min(0.1, distance * 0.05);
		this.camera.lookAt(this.target);
		this.camera.updateProjectionMatrix();
		if (this.globeRadiance) {
			const distance = this.camera.position.length();
			// Match the projected silhouette of the scan sphere at every zoom level.
			const radius =
				(GLOBE_SCAN_RADIUS * distance) /
				Math.sqrt(Math.max(distance ** 2 - GLOBE_SCAN_RADIUS ** 2, 0.01));
			this.globeRadiance.scale.set(radius * 2, radius * 2, 1);
		}
	}

	private retainOutgoingRegion() {
		this.finishRegionTransition();
		this.closeMonitoringPoint();
		this.setHovered(undefined);
		const mapObjects = this.map.children.filter(
			(object) => object.visible && object !== this.mapEffects.group,
		);
		const worldObjects = [
			this.labels,
			this.background,
			this.orbitRing,
			...Object.values(this.layers),
		].filter((object) => this.isVisible(object));
		const detail = mapObjects.find((object) => object.userData.drilldown);
		const saved = [...mapObjects, ...worldObjects].map((object) => ({
			object,
			parent: object.parent!,
		}));
		const frozenLabels = new Set<Object3D>();
		const groupOrders: RegionGeometryTransition["groupOrders"] = [];
		const outgoingAccents: RegionGeometryTransition["outgoingAccents"] = [];
		for (const object of [...mapObjects, ...worldObjects]) {
			object.traverse((child) => {
				if (
					child.name === "ChinaGlowingBoundary" ||
					child instanceof Line ||
					child.userData.blueLayer
				)
					outgoingAccents.push({ object: child, visible: child.visible });
				if (child instanceof Group) {
					groupOrders.push({ group: child, order: child.renderOrder });
					child.renderOrder = 50;
				}
				if (child.userData.mapName || child instanceof Sprite)
					frozenLabels.add(child);
			});
		}
		const outgoingMap = new Group();
		const outgoingWorld = new Group();
		for (const group of [outgoingMap, outgoingWorld]) {
			group.renderOrder = 50;
			group.userData.outgoingRegion = true;
		}
		this.map.add(outgoingMap);
		this.chinaRoot.add(outgoingWorld);
		outgoingMap.add(...mapObjects);
		outgoingWorld.add(...worldObjects);
		// Composite the old geography over the new geography with its own
		// depth buffer, so real top surfaces and side walls keep their occlusion.
		const depthBoundary = new Mesh(
			new PlaneGeometry(1, 1),
			new MeshBasicMaterial({
				transparent: true,
				colorWrite: false,
				depthWrite: false,
				depthTest: false,
			}),
		);
		depthBoundary.frustumCulled = false;
		depthBoundary.renderOrder = -1000;
		depthBoundary.onBeforeRender = (renderer) => renderer.clearDepth();
		outgoingMap.add(depthBoundary);
		this.regionTransition = {
			outgoing: [outgoingMap, outgoingWorld],
			outgoingAccents,
			saved,
			retired: new Set(
				mapObjects.filter((object) => object.userData.drilldown),
			),
			incoming: [],
			incomingLabels: [],
			depthObjects: [],
			fromDepth: Number(detail?.userData.baseDepth ?? CHINA_MAP_DEPTH),
			depthRatio: 1,
			depthOffset: 0,
			progress: 0,
			frozenLabels,
			groupOrders,
			effectsFromPosition: this.mapEffects.group.position.clone(),
			effectsFromScale: this.mapEffects.group.scale.clone(),
		};
		for (const group of this.regionTransition.outgoing) {
			this.regionReveal.initialize(group, true);
			this.regionReveal.preserveDepth(group);
		}
	}

	private prepareIncomingRegion(
		objects: Object3D[],
		labels: Object3D[],
		depth: number,
	) {
		const transition = this.regionTransition;
		if (!transition) return;
		transition.incoming = objects;
		transition.incomingLabels = labels;
		transition.depthRatio = Math.min(
			2,
			transition.fromDepth / Math.max(depth, 0.000001),
		);
		// Match the old surface's height without stretching a small district
		// into a tall block while the camera is moving towards it.
		transition.depthOffset = Math.max(
			0,
			transition.fromDepth - depth * transition.depthRatio,
		);
		transition.depthObjects = objects
			.filter(
				(object) =>
					object.parent === this.map ||
					object === this.labels ||
					Object.values(this.layers).includes(object as Group),
			)
			.map((object) => ({
				object,
				scaleZ: object.scale.z,
				positionZ: object.position.z,
			}));
		for (const object of objects) {
			this.regionReveal.initialize(object, true);
			this.regionReveal.preserveDepth(object);
		}
		for (const label of labels) this.regionReveal.setProgress(label, 0);
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ * transition.depthRatio;
			if (object.parent === this.map)
				object.position.z = positionZ + transition.depthOffset;
		}
		transition.effectsToPosition = this.mapEffects.group.position.clone();
		transition.effectsToScale = this.mapEffects.group.scale.clone();
		this.mapEffects.group.position.copy(transition.effectsFromPosition);
		this.mapEffects.group.scale.copy(transition.effectsFromScale);
		this.mapEffects.cancelExit();
		this.mapLabelOpacity = 1;
		this.layerMotion.update();
		// Prepare shaders and label textures before the flight begins.
		for (const root of objects) {
			root.traverse((object) => {
				if (!(object instanceof Mesh || object instanceof Sprite)) return;
				const materials = Array.isArray(object.material)
					? object.material
					: [object.material];
				for (const material of materials) {
					const texture = (material as MeshBasicMaterial).map;
					if (texture) this.renderer.initTexture(texture);
				}
			});
		}
		this.renderer.compile(this.scene, this.camera);
		const previousTarget = this.renderer.getRenderTarget();
		const warmTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
		try {
			this.renderer.setRenderTarget(warmTarget);
			this.renderer.render(this.scene, this.camera);
		} finally {
			this.renderer.setRenderTarget(previousTarget);
			warmTarget.dispose();
		}
		for (const object of objects) this.regionReveal.setProgress(object, 0);
	}

	private finishRegionTransition(runPending = false) {
		const transition = this.regionTransition;
		if (!transition) return;
		this.regionTransition = undefined;
		for (const { group, order } of transition.groupOrders)
			group.renderOrder = order;
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ;
			object.position.z = positionZ;
		}
		for (const root of [...transition.outgoing, ...transition.incoming])
			this.regionReveal.forget(root);
		for (const { object, visible } of transition.outgoingAccents) {
			if (!object.userData.blueLayer) object.visible = visible;
		}
		for (const { object, parent } of transition.saved) {
			if (transition.retired.has(object)) {
				this.disposeObject(object as Group);
				object.removeFromParent();
				continue;
			}
			parent.add(object);
			if (
				parent === this.map ||
				object === this.labels ||
				object === this.background ||
				object === this.orbitRing
			)
				object.visible = !this.selectedRegion;
			if (
				Object.values(this.layers).includes(object as Group) &&
				this.selectedRegion
			)
				object.removeFromParent();
		}
		for (const root of transition.outgoing) {
			this.disposeObject(root);
			root.removeFromParent();
		}
		if (transition.effectsToPosition)
			this.mapEffects.group.position.copy(transition.effectsToPosition);
		if (transition.effectsToScale)
			this.mapEffects.group.scale.copy(transition.effectsToScale);
		const goBack = this.pendingRegionBack;
		this.pendingRegionBack = false;
		if (runPending && goBack && !this.destroyed) this.goBack();
	}

	private getMapCameraPose(): MapCameraPose {
		return {
			target: this.target.clone(),
			zoom: this.zoomLevel,
			pitch: this.cameraPitch,
			yaw: this.cameraYaw,
			rotation: this.mapRotation,
			rotationCenter: this.mapRotationCenter.clone(),
			topView: this.topView,
		};
	}

	private restoreMapCameraPose(pose: MapCameraPose) {
		this.target.copy(pose.target);
		this.zoomLevel = pose.zoom;
		this.cameraPitch = pose.pitch;
		this.cameraYaw = pose.yaw;
		this.mapRotation = pose.rotation;
		this.mapRotationCenter.copy(pose.rotationCenter);
		this.topView = pose.topView;
		this.updateMapRotation();
		this.updateCamera();
	}

	private fitRegionZoom(
		mesh: Mesh,
		target: Vector3,
		spatialScale: number,
		span: number,
	) {
		const positions = mesh.geometry.getAttribute("position");
		const point = new Vector3();
		const pitch = this.cameraPitch;
		const leaf = Number(mesh.userData.feature?.properties?.childrenNum) === 0;
		let lower = 0;
		let upper = 14 / span;
		// Fit the actual silhouette into the central display, including its raised surface.
		for (let step = 0; step < 20; step++) {
			const zoom = (lower + upper) / 2;
			const distance = this.cameraDistance / zoom;
			this.camera.position.set(
				target.x,
				target.y + distance * Math.sin(pitch),
				target.z + distance * Math.cos(pitch),
			);
			this.camera.lookAt(target);
			this.camera.updateMatrixWorld();
			let fits = true;
			for (let index = 0; index < positions.count; index++) {
				const height = positions.getZ(index);
				point
					.set(
						positions.getX(index),
						this.map.position.y +
							(height + (height > 0 ? 0.025 : 0)) * spatialScale,
						-positions.getY(index),
					)
					.project(this.camera);
				if (
					Math.abs(point.x) > (leaf ? 0.27 : 0.4) ||
					point.y > (leaf ? 0.4 : 0.52) ||
					point.y < (leaf ? -0.6 : -0.72)
				) {
					fits = false;
					break;
				}
			}
			if (fits) lower = zoom;
			else upper = zoom;
		}
		this.updateCamera();
		return Math.max(0.25, lower);
	}

	private simplifyRing(ring: Position[], threshold = 0.012) {
		const result: Vector2[] = [];
		let previous: Vector2 | undefined;
		for (let i = 0; i < ring.length; i++) {
			const p = this.point([ring[i][0], ring[i][1]]);
			const v = new Vector2(p.x, p.y);
			if (
				!previous ||
				previous.distanceTo(v) >= threshold ||
				i === ring.length - 1
			) {
				result.push(v);
				previous = v;
			}
		}
		return result;
	}

	private shapes(feature: MapFeature, threshold = 0.012) {
		return polygonsOf(feature).flatMap((polygon) => {
			if (!polygon[0] || polygon[0].length < 3) return [];
			const vertices = this.simplifyRing(polygon[0], threshold);
			if (vertices.length < 3) return [];
			const shape = new Shape(vertices);
			for (const ring of polygon.slice(1)) {
				const hole = this.simplifyRing(ring, threshold);
				if (hole.length > 2) shape.holes.push(new Shape(hole));
			}
			return [shape];
		});
	}

	private topMaterial(
		bounds = new Vector3(-7.5, -4, 15),
		height = 9,
		focused = false,
		reveal = { value: 1 },
	) {
		return new ShaderMaterial({
			uniforms: {
				bodyReveal: this.bodyReveal,
				faceReveal: reveal,
				hovered: { value: 0 },
				mapBounds: { value: bounds },
				mapHeight: { value: height },
				focused: { value: focused ? 1 : 0 },
			},
			vertexShader:
				"varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
			fragmentShader: `
				varying vec3 vPosition;
				uniform float hovered;
				uniform float bodyReveal;
				uniform float faceReveal;
				uniform vec3 mapBounds;
				uniform float mapHeight;
				uniform float focused;
				void main() {
					float along = clamp((vPosition.x - mapBounds.x) / mapBounds.z, 0., 1.);
					float north = clamp((vPosition.y - mapBounds.y) / max(mapHeight,.00001), 0., 1.);
					vec3 dark = mix(vec3(.016,.072,.16), vec3(.02,.095,.20), focused);
					vec3 blue = mix(vec3(.065,.30,.62), vec3(.06,.28,.56), focused);
					float gradient = pow(clamp(along*.88 + north*.12, 0., 1.), 1.2);
					vec3 color = mix(dark, blue, .08 + gradient*.86);
					// Fixed square dots use map coordinates and resolve gradually when zooming in.
					float spacing = .078 * max(mapBounds.z / 15., .00001);
					vec2 grid = (vPosition.xy - mapBounds.xy) / spacing;
					vec2 footprint = fwidth(grid);
					vec2 cell = abs(fract(grid) - .5);
					vec2 aa = max(footprint * .5, vec2(.025));
					vec2 square = 1. - smoothstep(vec2(.17) - aa, vec2(.17) + aa, cell);
					float detail = 1. - smoothstep(.16, .38, max(footprint.x, footprint.y));
					float coverage = mix(.1156, square.x * square.y, detail);
					color += vec3(.008,.018,.030) * coverage;
					color = mix(color, vec3(.30,.70,.90), hovered);
					gl_FragColor = vec4(color,bodyReveal * faceReveal);
					#include <colorspace_fragment>
				}
			`,
			side: DoubleSide,
		});
	}

	private lines(
		feature: MapFeature,
		group: Group,
		height: number,
		color: string,
		opacity: number,
		skipSmall = false,
		spatialScale = 1,
		context = false,
	) {
		const material = new LineBasicMaterial({
			color,
			transparent: true,
			opacity,
			depthTest: true,
		});
		if (context) this.contextMaterial(material);
		for (const polygon of polygonsOf(feature)) {
			const ring = polygon[0];
			if (!ring?.length) continue;
			const points = this.simplifyRing(ring, 0.012 * spatialScale);
			if (skipSmall && points.length < 7) continue;
			const geometry = new BufferGeometry().setFromPoints(
				points.map((v) => new Vector3(v.x, v.y, height)),
			);
			const line = new LineLoop(geometry, material);
			line.renderOrder = 5;
			group.add(line);
		}
		return material;
	}

	private createChina(
		data: FeatureCollection<Polygon | MultiPolygon>,
		outline: FeatureCollection<Polygon | MultiPolygon>,
	) {
		const sideMaterial = this.sideMaterial(CHINA_MAP_DEPTH);
		for (const feature of data.features) {
			const name = feature.properties?.name as string;
			if (!name) {
				this.lines(feature, this.map, 0.02, "#678dad", 0.38);
				continue;
			}
			const shapes = this.shapes(feature);
			if (!shapes.length) continue;
			const geometry = new ExtrudeGeometry(shapes, {
				depth: CHINA_MAP_DEPTH,
				bevelEnabled: false,
				curveSegments: 1,
			});
			const top = this.topMaterial();
			const mesh = new Mesh(geometry, [top, sideMaterial]);
			mesh.userData = { name, feature, top };
			this.map.add(mesh);
			this.regionMeshes.push(mesh);
			this.lines(feature, this.map, CHINA_MAP_DEPTH + 0.006, "#bfe3ff", 0.8);
			const center = (feature.properties?.centroid ??
				feature.properties?.center) as [number, number] | undefined;
			if (center && !["香港特别行政区", "澳门特别行政区"].includes(name)) {
				const labelCenter: [number, number] =
					name === "山西省"
						? [111.0, 37.2]
						: name === "天津市"
							? [119.8, 39.7]
							: center;
				const label = this.mapName(
					name,
					this.point(labelCenter, CHINA_MAP_DEPTH + 0.018),
					false,
					14,
				);
				this.layers.label.add(label);
				if (name === "天津市") {
					this.layers.label.add(
						new Line(
							new BufferGeometry().setFromPoints([
								this.point(center, CHINA_MAP_DEPTH + 0.06),
								this.point([118.7, 39.7], CHINA_MAP_DEPTH + 0.06),
							]),
							new LineBasicMaterial({
								color: "#8ab0cd",
								transparent: true,
								opacity: 0.38,
							}),
						),
					);
				}
			}
			const tint = new Mesh(
				new ShapeGeometry(shapes),
				new MeshBasicMaterial({
					color: ["#26628a", "#384faf", "#225981", "#276770"][
						this.regionMeshes.length % 4
					],
					transparent: true,
					opacity: 0.34,
					depthWrite: false,
				}),
			);
			tint.position.z = CHINA_MAP_DEPTH + 0.014;
			this.layers.region.add(tint);
		}
		for (const feature of outline.features) {
			this.createBorderGlow(feature, this.map, CHINA_MAP_DEPTH);
			this.lines(feature, this.map, 0.006, "#c29a62", 0.64, true);
		}
		const title = this.textSprite("中国\nCHINA", {
			size: 76,
			color: "#ffffff",
			width: 384,
			height: 192,
			bold: true,
		});
		title.scale.set(4.4, 1.8, 1);
		title.position.set(6.27, -6.35, 0.78);
		this.labels.add(title);
	}

	private sideMaterial(depth = 0.36, spatialScale = 1) {
		const material = new ShaderMaterial({
			uniforms: {
				bodyReveal: this.bodyReveal,
				sideMap: { value: this.sideTexture },
				time: { value: 0 },
				depth: { value: depth },
				wallScale: { value: spatialScale },
			},
			vertexShader:
				"varying float height;varying vec2 sideUv;void main(){height=position.z;sideUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
			fragmentShader: `
				varying float height;
				varying vec2 sideUv;
				uniform sampler2D sideMap;
				uniform float time;
				uniform float depth;
				uniform float wallScale;
				uniform float bodyReveal;
				void main(){
					float h=clamp(height/depth,0.,1.);
					float u=sideUv.x/max(wallScale,.00001);
					// A fixed phase rises in map height as time increases.
					float rise=h-time*.28;
					float textureStripe=texture2D(sideMap,vec2(sideUv.x,fract(rise))).g;
					float fibers=pow(.5+.5*sin(u*42.),8.);
					float fineFibers=pow(.5+.5*sin(u*84.+1.1),12.);
					float phase=fract(rise+u*.18);
					float flow=pow(1.-phase,4.);
					vec2 cell=fract(vec2(u*12.,rise*4.));
					vec2 cellId=floor(vec2(u*12.,rise*4.));
					float cellLight=.35+.65*fract(sin(dot(cellId,vec2(12.9898,78.233)))*43758.5453);
					float blocks=smoothstep(.18,.25,cell.x)*(1.-smoothstep(.59,.66,cell.x));
					blocks*=smoothstep(.12,.20,cell.y)*(1.-smoothstep(.44,.52,cell.y))*cellLight;
					float dots=(1.-smoothstep(.025,.09,abs(cell.x-.83)))*(1.-smoothstep(.035,.12,abs(cell.y-.76)))*cellLight;
					vec3 color=mix(vec3(.003,.014,.04),vec3(.022,.10,.26),h);
					color+=vec3(.018,.075,.20)*(fibers+.4*fineFibers)*(.3+h*.7);
					color+=vec3(.045,.20,.50)*flow*(.18+fibers*.82);
					color+=vec3(.025,.065,.16)*textureStripe;
					color+=vec3(.025,.10,.24)*blocks+vec3(.04,.16,.34)*dots;
					color+=vec3(.09,.26,.46)*smoothstep(.91,1.,h);

					gl_FragColor=vec4(color,bodyReveal);
					#include <colorspace_fragment>
				}
			`,
			side: DoubleSide,
		});
		this.sideMaterials.add(material);
		return material;
	}

	private playChinaEntrance() {
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		this.labelTween?.kill();
		this.mapLabelOpacity = 0;
		if (this.reducedMotion.matches) {
			this.zoomLevel = 1;
			this.cameraPitch = 0.72;
			this.cameraYaw = 0;
			this.updateCamera();
			this.mapEffects.restartEntrance();
			this.revealMapNames();
			return;
		}
		const objects = this.map.children
			.filter((object) => object !== this.mapEffects.group)
			.map((object) => ({
				object,
				scaleZ: object.scale.z,
				positionZ: object.position.z,
			}));
		const uniqueMaterials = new Set<Material>();
		for (const { object } of objects) {
			object.traverse((child) => {
				if (!(child instanceof Mesh || child instanceof Line)) return;
				for (const material of Array.isArray(child.material)
					? child.material
					: [child.material])
					uniqueMaterials.add(material);
			});
		}
		const materials = [...uniqueMaterials].map((material) => ({
			material,
			opacity: material.opacity,
			transparent: material.transparent,
			depthWrite: material.depthWrite,
		}));
		const entrance: ChinaEntranceState = { objects, materials };
		this.chinaEntrance = entrance;
		this.bodyReveal.value = 0;
		for (const { object, positionZ } of objects) {
			object.scale.z = 0;
			object.position.z = positionZ - 0.01;
		}
		for (const { material } of materials) {
			material.opacity = 0;
			material.transparent = true;
			material.depthWrite = false;
			material.needsUpdate = true;
		}
		// Match Chongqing's distant, low view from the left at any viewport size.
		this.zoomLevel = 0.568;
		this.cameraPitch = 0.3;
		this.cameraYaw = -0.337;
		this.updateCamera();
		this.mapEffects.restartEntrance(CHINA_ENTRANCE_DELAY + 3 + 0.25);
		const timeline = gsap.timeline({
			delay: CHINA_ENTRANCE_DELAY,
			onComplete: () => {
				this.restoreChinaEntrance();
				this.updateCamera();
				this.mapEffects.restartEntrance(0.25);
				this.revealMapNames();
			},
		});
		entrance.timeline = timeline;
		this.transitionTimeline = timeline;
		timeline.to(
			this,
			{
				zoomLevel: 1,
				cameraPitch: 0.72,
				cameraYaw: 0,
				duration: 2,
				ease: "circ.out",
				onUpdate: () => this.updateCamera(),
			},
			0,
		);
		for (const { object, scaleZ, positionZ } of objects) {
			timeline.to(
				object.scale,
				{ z: scaleZ, duration: 1, ease: "circ.out" },
				1.5,
			);
			timeline.to(object.position, { z: positionZ, duration: 1 }, 1.5);
		}
		timeline.to(
			this.bodyReveal,
			{ value: 1, duration: 1, ease: "circ.out" },
			2,
		);
		for (const { material, opacity } of materials)
			timeline.to(material, { opacity, duration: 1, ease: "circ.out" }, 2);
	}

	private restoreChinaEntrance() {
		const entrance = this.chinaEntrance;
		if (!entrance) return;
		entrance.timeline?.kill();
		this.chinaEntrance = undefined;
		this.bodyReveal.value = 1;
		this.cameraYaw = 0;
		for (const { object, scaleZ, positionZ } of entrance.objects) {
			object.scale.z = scaleZ;
			object.position.z = positionZ;
		}
		for (const {
			material,
			opacity,
			transparent,
			depthWrite,
		} of entrance.materials) {
			material.opacity = opacity;
			material.transparent = transparent;
			material.depthWrite = depthWrite;
			material.needsUpdate = true;
		}
		this.updateCamera();
	}

	private stopViewEntrance() {
		if (this.viewEntranceActive) {
			this.transitionTimeline?.kill();
			this.viewEntranceActive = false;
			this.chinaRoot.scale.setScalar(1);
			if (!this.switchingView) this.callbacks.onViewMotionChange?.("idle");
		}
	}

	private stopCameraControls() {
		this.restoreChinaEntrance();
		this.stopViewEntrance();
		this.zoomTween?.kill();
		this.angleTween?.kill();
		this.zoomTween = undefined;
		this.angleTween = undefined;
		this.zoomTarget = undefined;
	}

	private prepareViewEntrance(view: View) {
		// Switching uses a restrained reveal; the original first-load flight stays separate.
		this.zoomLevel = view === "globe" ? 1 : 0.97;
		this.cameraPitch = 0.76;
		this.cameraYaw = 0;
		this.mapLabelOpacity = view === "china" ? 0.25 : 0;
		this.globeLabelOpacity = view === "globe" ? 0.3 : 0;
		if (view === "china") this.chinaRoot.scale.y = 0.96;
		else if (this.globeMesh) this.globeMesh.rotation.y = GLOBE_HOME.y - 0.06;
		this.updateCamera();
		this.viewEntranceActive = true;
		const timeline = gsap.timeline({
			paused: true,
			onComplete: () => {
				this.viewEntranceActive = false;
				this.chinaRoot.scale.setScalar(1);
				this.callbacks.onViewMotionChange?.("idle");
				this.revealMapNames();
			},
		});
		this.transitionTimeline = timeline;
		const dolly = { distance: 1 / this.zoomLevel };
		timeline.to(
			dolly,
			{
				distance: 1,
				duration: 1.65,
				ease: "sine.inOut",
				onUpdate: () => {
					this.zoomLevel = 1 / dolly.distance;
					this.updateCamera();
				},
			},
			0,
		);
		timeline.to(
			this,
			{
				cameraPitch: 0.72,
				duration: 1.65,
				ease: "sine.inOut",
				onUpdate: () => this.updateCamera(),
			},
			0,
		);
		timeline.to(
			this,
			{
				mapLabelOpacity: view === "china" ? 1 : 0,
				globeLabelOpacity: view === "globe" ? 1 : 0,
				duration: 1.1,
				ease: "sine.inOut",
			},
			0.35,
		);
		if (view === "china")
			timeline.to(
				this.chinaRoot.scale,
				{ y: 1, duration: 1.65, ease: "sine.inOut" },
				0,
			);
		else if (this.globeMesh)
			timeline.to(
				this.globeMesh.rotation,
				{ ...GLOBE_HOME, duration: 1.65, ease: "sine.inOut" },
				0,
			);
		// The last staggered side button settles at 1.9s; breathing resumes afterward.
		timeline.call(() => this.revealMapNames(), [], 2);
	}

	private transitionRegionCamera(
		target: Vector3,
		zoom: number,
		returnPose?: MapCameraPose,
	) {
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		this.labelTween?.kill();
		const from = this.getMapCameraPose();
		const destination: MapCameraPose = returnPose ?? {
			target: target.clone(),
			zoom,
			pitch: 0.72,
			yaw: 0,
			rotation: 0,
			rotationCenter: this.selectedRegion
				? new Vector2(this.detailHomeTarget.x, -this.detailHomeTarget.z)
				: new Vector2(),
			topView: false,
		};
		const angleDelta = (start: number, end: number) => {
			const turn = Math.PI * 2;
			return ((((end - start + Math.PI) % turn) + turn) % turn) - Math.PI;
		};
		const yawDelta = angleDelta(from.yaw, destination.yaw);
		const rotationDelta = angleDelta(from.rotation, destination.rotation);
		const transition = this.regionTransition;
		const motion = { progress: 0 };
		const update = () => {
			const time = motion.progress;
			// Zero velocity and acceleration at both ends keeps the last frames
			// settling into the same live geometry rather than revealing a replacement.
			const progress = time * time * time * (time * (time * 6 - 15) + 10);
			// Interpolate zoom by ratio so both inward and outward flights have
			// the same visual pace, with no separate pause at the map replacement.
			this.zoomLevel = from.zoom * (destination.zoom / from.zoom) ** progress;
			this.target.lerpVectors(from.target, destination.target, progress);
			this.cameraPitch =
				from.pitch + (destination.pitch - from.pitch) * progress;
			this.cameraYaw = from.yaw + yawDelta * progress;
			this.mapRotation = from.rotation + rotationDelta * progress;
			this.mapRotationCenter.lerpVectors(
				from.rotationCenter,
				destination.rotationCenter,
				progress,
			);
			if (transition) {
				transition.progress = time;
				const reveal = smoothProgress((time - 0.28) / 0.68);
				for (const root of transition.outgoing)
					this.regionReveal.setProgress(root, 1 - reveal);
				for (const { object } of transition.outgoingAccents)
					this.regionReveal.setProgress(
						object,
						1 - smoothProgress((time - 0.05) / 0.57),
					);
				for (const root of transition.incoming)
					this.regionReveal.setProgress(
						root,
						smoothProgress((time - 0.08) / 0.68),
					);
				for (const root of transition.incomingLabels)
					this.regionReveal.setProgress(
						root,
						smoothProgress((time - 0.18) / 0.72),
					);
				const depthScale = transition.depthRatio ** (1 - progress);
				for (const { object, scaleZ, positionZ } of transition.depthObjects) {
					object.scale.z = scaleZ * depthScale;
					if (object.parent === this.map)
						object.position.z =
							positionZ + transition.depthOffset * (1 - progress);
				}
				if (transition.effectsToPosition)
					this.mapEffects.group.position.lerpVectors(
						transition.effectsFromPosition,
						transition.effectsToPosition,
						progress,
					);
				if (transition.effectsToScale)
					this.mapEffects.group.scale.lerpVectors(
						transition.effectsFromScale,
						transition.effectsToScale,
						progress,
					);
			}
			this.updateMapRotation();
			this.updateCamera();
		};
		const timeline = gsap.timeline({
			onComplete: () => {
				this.restoreMapCameraPose(destination);
				this.mapLabelOpacity = 1;
				this.finishRegionTransition(true);
			},
		});
		this.transitionTimeline = timeline;
		update();
		timeline.to(motion, {
			progress: 1,
			duration: this.reducedMotion.matches ? 0 : REGION_TRANSITION_DURATION,
			ease: "none",
			onUpdate: update,
		});
	}

	private transitionCamera(
		target: Vector3,
		zoom: number,
		duration = 1.25,
		delay = 0,
	) {
		if (this.reducedMotion.matches) duration = delay = 0;
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		this.labelTween?.kill();
		if (this.view === "china") {
			this.mapLabelOpacity = 0;
			this.mapEffects.restartEntrance(duration + delay + 0.25);
		}
		const timeline = gsap.timeline({
			delay,
			onComplete: () => this.revealMapNames(),
		});
		this.transitionTimeline = timeline;
		const dolly = { distance: 1 / this.zoomLevel };
		timeline.to(
			dolly,
			{
				distance: 1 / zoom,
				duration,
				ease: "power2.inOut",
				onUpdate: () => {
					this.zoomLevel = 1 / dolly.distance;
					this.updateCamera();
				},
			},
			0,
		);
		timeline.to(
			this.target,
			{
				x: target.x,
				y: target.y,
				z: target.z,
				duration,
				ease: "power2.inOut",
				onUpdate: () => this.updateCamera(),
			},
			0,
		);
		timeline.to(
			this,
			{
				mapRotation: 0,
				...(this.view === "china" ? { cameraPitch: 0.72, cameraYaw: 0 } : {}),
				duration,
				ease: "power2.inOut",
				onUpdate: () => {
					this.updateMapRotation();
					this.updateCamera();
				},
			},
			0,
		);
	}

	private createBorderGlow(
		feature: MapFeature,
		parent = this.map,
		depth = 0.36,
		spatialScale = 1,
	) {
		const rings = polygonsOf(feature).map((polygon) =>
			this.simplifyRing(polygon[0], 0.006 * spatialScale).map(
				(point) => new Vector3(point.x, point.y, depth + 0.008 * spatialScale),
			),
		);
		const stroke = this.mapEffects.stroke(
			rings,
			spatialScale,
			parent.userData.materialBounds as Vector3 | undefined,
		);
		parent.add(stroke);
		return stroke;
	}

	private createSurrounding(
		countries: FeatureCollection<Polygon | MultiPolygon>,
	) {
		const group = this.surrounding;
		group.name = "ChinaSurroundingContext";
		group.rotation.x = -Math.PI / 2;
		group.position.y = this.map.position.y - 0.08;
		const shapes = countries.features.flatMap((feature) =>
			/China|中国|中华人民共和国/i.test(String(feature.properties?.name ?? ""))
				? []
				: this.shapes(feature),
		);
		const land = new Mesh(
			new ShapeGeometry(shapes),
			this.contextMaterial(
				new MeshBasicMaterial({
					color: "#142d40",
					transparent: true,
					opacity: 0.74,
				}),
			),
		);
		land.name = "SurroundingLandSilhouette";
		land.raycast = () => undefined;
		group.add(land);
		const countryNames: [string, [number, number]][] = [
			["哈萨克斯坦", [76, 44.2]],
			["俄罗斯", [111.5, 57.5]],
			["蒙古", [106.5, 46.4]],
			["朝鲜", [130.3, 39.2]],
			["日本", [139.5, 36.7]],
			["印度", [80.0, 29.0]],
			["缅甸", [94.8, 23.6]],
			["老挝", [103.8, 18.6]],
			["越南", [108.6, 14.7]],
		];
		for (const [name, coordinates] of countryNames) {
			const label = this.mapName(
				name,
				this.point(coordinates, 0.06),
				false,
				12,
				"context",
			);
			group.add(label);
		}
		this.background.add(group);
	}

	private contextMaterial<T extends MeshBasicMaterial | LineBasicMaterial>(
		material: T,
	) {
		const fadeFloor = material instanceof LineBasicMaterial ? 0.14 : 0.035;
		material.depthWrite = false;
		material.onBeforeCompile = (shader) => {
			shader.uniforms.contextViewport = { value: this.contextViewport };
			shader.fragmentShader =
				`uniform vec2 contextViewport;\n${shader.fragmentShader}`.replace(
					"#include <opaque_fragment>",
					`#include <opaque_fragment>
					vec2 screen = gl_FragCoord.xy / contextViewport;
					float sideFade = 1. - smoothstep(.24, .43, abs(screen.x - .5));
					float endFade = 1. - smoothstep(.32, .48, abs(screen.y - .5));
					gl_FragColor.a *= mix(${fadeFloor}, 1., sideFade * endFade);`,
				);
		};
		material.customProgramCacheKey = () => `context-${fadeFloor}`;
		return material;
	}

	private textureCanvas(
		width: number,
		height: number,
		draw: (context: CanvasRenderingContext2D) => void,
	) {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (context) draw(context);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		this.disposableTextures.add(texture);
		return texture;
	}

	private textSprite(
		text: string,
		options: {
			size?: number;
			color?: string;
			opacity?: number;
			width?: number;
			height?: number;
			bold?: boolean;
			plate?: boolean;
			simplePlate?: boolean;
		} = {},
	) {
		const width = options.width ?? 256;
		const height = options.height ?? 64;
		const texture = this.textureCanvas(width * 2, height * 2, (context) => {
			context.scale(2, 2);
			if (options.plate) {
				context.fillStyle = options.simplePlate
					? "rgba(2,13,26,.84)"
					: "rgba(2,13,26,.90)";
				context.fillRect(8, 8, width - 16, height - 16);
				if (!options.simplePlate) {
					context.strokeStyle = "rgba(111,204,233,.55)";
					context.lineWidth = 2;
					context.strokeRect(8, 8, width - 16, height - 16);
					context.strokeStyle = "#baffff";
					context.strokeRect(22, height / 2 - 10, 22, 20);
					context.fillStyle = "#c9ffff";
					context.beginPath();
					context.moveTo(29, height / 2 + 5);
					context.lineTo(35, height / 2 - 5);
					context.lineTo(41, height / 2 + 5);
					context.fill();
				}
			}
			context.fillStyle = options.color ?? "#e8f9ff";
			context.textAlign = "center";
			context.textBaseline = "middle";
			const lines = text.split("\n");
			const size = options.size ?? 30;
			for (let i = 0; i < lines.length; i++) {
				context.font = `${options.simplePlate ? "600" : options.bold ? "900" : "500"} ${i === 1 ? size * 0.72 : size}px ${options.bold ? '"阿里妈妈数黑体 Bold",' : ""}"Alibaba PuHuiTi", "PingFang SC", sans-serif`;
				if (options.bold) {
					context.shadowColor = "#dcefff";
					context.shadowBlur = 4;
				}
				context.fillText(
					lines[i],
					width / 2 + (options.plate && !options.simplePlate ? 15 : 0),
					height / 2 + (i - (lines.length - 1) / 2) * size * 0.9,
				);
			}
		});
		return new Sprite(
			new SpriteMaterial({
				map: texture,
				transparent: true,
				opacity: options.opacity ?? 1,
				depthTest: false,
				depthWrite: false,
			}),
		);
	}

	private mapName(
		name: string,
		position: Vector3,
		leaf = false,
		pixels = leaf ? 16 : 14,
		variant: "region" | "context" = "region",
	) {
		const contextLabel = variant === "context";
		const textureWidth = contextLabel
			? name.length * 56 + 112
			: Math.max(96, name.length * 64 + 32);
		const texture = this.textureCanvas(textureWidth, 96, (context) => {
			context.font = `${contextLabel ? "600 54" : "500 64"}px "Alibaba PuHuiTi", "PingFang SC", sans-serif`;
			context.textAlign = "center";
			context.textBaseline = "middle";
			if (contextLabel) {
				context.fillStyle = "rgba(2, 10, 19, .9)";
				context.fillRect(4, 8, textureWidth - 8, 80);
				context.strokeStyle = "rgba(133, 186, 201, .75)";
				context.lineWidth = 2;
				context.strokeRect(18, 28, 52, 40);
				context.beginPath();
				context.moveTo(21, 31);
				context.lineTo(67, 65);
				context.moveTo(21, 65);
				context.lineTo(67, 31);
				context.stroke();
				context.fillStyle = "#edfaff";
				context.fillRect(35, 41, 18, 14);
			}
			context.shadowColor = "#061425";
			context.shadowBlur = 6;
			context.fillStyle = contextLabel ? "#e6f3ff" : "#deefff";
			context.fillText(name, (textureWidth + (contextLabel ? 76 : 0)) / 2, 48);
		});
		const spatialScale = this.selectedRegion
			? this.mapEffects.group.scale.x
			: 1;
		const height = (pixels / 14) * (contextLabel ? 0.7 : 0.42) * spatialScale;
		const label = new Mesh(
			new PlaneGeometry((height * textureWidth) / 96, height),
			new MeshBasicMaterial({
				map: texture,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				depthTest: true,
				toneMapped: false,
				side: DoubleSide,
			}),
		);
		label.name = `MapSurfaceLabel-${name}`;
		label.userData.mapName = {
			variant,
			surfaceHeight: position.z,
			riseDepth: 0.85 * spatialScale,
		};
		label.position.copy(position);
		if (contextLabel) label.position.z -= 0.85 * spatialScale;
		label.renderOrder = 14;
		label.raycast = () => undefined;
		this.surfaceLabels.push(label);
		return label;
	}

	private revealMapNames() {
		if (
			this.mapLabelOpacity >= 1 ||
			this.view !== "china" ||
			this.switchingView ||
			this.detailLoading ||
			this.transitionTimeline?.isActive() ||
			this.detailTimeline?.isActive()
		)
			return;
		this.labelTween?.kill();
		this.labelTween = gsap.to(this, {
			mapLabelOpacity: 1,
			duration: this.reducedMotion.matches ? 0 : 0.95,
			delay: this.reducedMotion.matches || this.mapLabelOpacity > 0 ? 0 : 0.2,
			ease: "power2.out",
		});
	}

	private updateMapNames() {
		for (const label of this.surfaceLabels) {
			if (this.regionTransition?.frozenLabels.has(label)) continue;
			const { variant, surfaceHeight, riseDepth } = label.userData.mapName;
			let layerReveal = 1;
			for (let parent = label.parent; parent; parent = parent.parent) {
				if (parent === this.drilledLabels || parent === this.layers.label) {
					layerReveal = this.layerMotion.getProgress(parent);
					break;
				}
			}
			if (variant === "context") {
				label.position.z =
					surfaceHeight -
					riseDepth * (1 - this.mapLabelOpacity) -
					riseDepth * 0.07 * (1 - layerReveal);
			} else {
				label.position.z =
					surfaceHeight - riseDepth * 0.045 * (1 - layerReveal);
			}
			label.material.opacity =
				this.mapLabelOpacity *
				(label.userData.mapName.reveal?.value ?? 1) *
				(variant === "context" ? 0.92 : 0.88);
		}
		for (const group of [this.layers.label, this.drilledLabels, this.labels]) {
			if (!group || !this.isVisible(group)) continue;
			for (const child of group.children) {
				if (!(child instanceof Sprite) || child.userData.mapName) continue;
				if (this.regionTransition?.frozenLabels.has(child)) continue;
				child.material.userData.referenceOpacity ??= child.material.opacity;
				child.material.opacity =
					child.material.userData.referenceOpacity * this.mapLabelOpacity;
			}
		}
	}

	private glowTexture(color = "#6de8ff") {
		const cached = this.glowTextures.get(color);
		if (cached) return cached;
		const texture = this.textureCanvas(64, 64, (context) => {
			const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
			gradient.addColorStop(0, "#ffffff");
			gradient.addColorStop(0.1, color);
			gradient.addColorStop(0.26, `${color}a0`);
			gradient.addColorStop(0.55, `${color}25`);
			gradient.addColorStop(1, `${color}00`);
			context.fillStyle = gradient;
			context.fillRect(0, 0, 64, 64);
		});
		this.glowTextures.set(color, texture);
		this.sharedTextures.add(texture);
		return texture;
	}

	private createCityMarkers() {
		chinaInfoPoints.forEach((item, index) => {
			const position = this.point([item.lng, item.lat], CHINA_MAP_DEPTH + 0.06);
			const info = this.mapEffects.info(position, index);
			this.layers.point.add(info.group, info.marker);
			this.monitoringMarkers.push(info.marker);
		});
	}

	private createScatter() {
		for (const item of chinaScatterPoints)
			this.layers.scatter.add(
				this.mapEffects.scatter(
					this.point([item.lng, item.lat], CHINA_MAP_DEPTH + 0.08),
					0.09 + (item.value / 196) * 0.08,
				),
			);
	}

	private createFlylines() {
		const center = this.point([104.3, 35.7], CHINA_MAP_DEPTH + 0.06);
		this.layers.flyline.add(this.mapEffects.focus(center));
		const names = [
			"广东省",
			"上海市",
			"四川省",
			"北京市",
			"新疆维吾尔自治区",
			"黑龙江省",
		];
		chinaRegions
			.filter((item) => names.includes(item.name))
			.forEach((item, index) => {
				const end = this.point(item.centroid, CHINA_MAP_DEPTH + 0.06);
				if (center.distanceTo(end) < 0.2) return;
				const middle = center.clone().lerp(end, 0.5);
				middle.z += Math.max(center.distanceTo(end) * 0.22, 0.6);
				const curve = new QuadraticBezierCurve3(center, middle, end);
				this.layers.flyline.add(this.mapEffects.flyline(curve, 1, index));
			});
	}

	private createHeatSurface(
		clusters: { position: Vector3; size: number; intensity: number }[],
	) {
		const minX = Math.min(...clusters.map((c) => c.position.x - c.size * 0.65));
		const maxX = Math.max(...clusters.map((c) => c.position.x + c.size * 0.65));
		const minY = Math.min(...clusters.map((c) => c.position.y - c.size * 0.65));
		const maxY = Math.max(...clusters.map((c) => c.position.y + c.size * 0.65));
		const width = maxX - minX,
			height = maxY - minY;
		const resolution = 180 / Math.max(width, height);
		const geometry = new PlaneGeometry(
			width,
			height,
			Math.max(32, Math.ceil(width * resolution)),
			Math.max(32, Math.ceil(height * resolution)),
		);
		const vertices = geometry.getAttribute("position");
		const values = new Float32Array(vertices.count);
		const averageSize =
			clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length;
		for (let index = 0; index < vertices.count; index++) {
			const x = vertices.getX(index) + (minX + maxX) / 2;
			const y = vertices.getY(index) + (minY + maxY) / 2;
			// Sum density before creating height: neighbouring peaks share slopes and valleys.
			let density = 0;
			for (const cluster of clusters) {
				const radius =
					((x - cluster.position.x) ** 2 + (y - cluster.position.y) ** 2) /
					(cluster.size * 0.5) ** 2;
				density += Math.exp(-radius * 2.6) * cluster.intensity;
			}
			values[index] = density;
			vertices.setZ(
				index,
				Math.max(0, density - 0.045) ** 0.9 * averageSize * 0.3,
			);
		}
		geometry.setAttribute("heat", new Float32BufferAttribute(values, 1));
		geometry.computeVertexNormals();
		const surface = new Mesh(
			geometry,
			new ShaderMaterial({
				vertexShader: `attribute float heat;varying float density;varying vec3 surfaceNormal;
				void main(){density=heat;surfaceNormal=normal;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying float density;varying vec3 surfaceNormal;
				void main(){float value=density;
				vec3 c=mix(vec3(.015,.24,.70),vec3(.015,.87,.34),smoothstep(.045,.24,value));
				c=mix(c,vec3(.5,.96,.01),smoothstep(.24,.46,value));
				c=mix(c,vec3(1.,.94,.005),smoothstep(.46,.82,value));
				c=mix(c,vec3(1.,.60,.005),smoothstep(1.05,1.75,value));
				float light=.72+.28*max(0.,dot(normalize(surfaceNormal),normalize(vec3(-.6,.7,1.))));
				float alpha=smoothstep(.025,.16,value)*.87;
				gl_FragColor=vec4(c*light,alpha);
				#include <colorspace_fragment>}`,
				transparent: true,
				depthWrite: false,
				side: DoubleSide,
			}),
		);
		surface.name = "ContinuousHeatMountains";
		surface.position.set(
			(minX + maxX) / 2,
			(minY + maxY) / 2,
			Math.min(...clusters.map((c) => c.position.z)),
		);
		surface.renderOrder = 9;
		return surface;
	}

	private createAlertPoints(
		pointLayer: Group,
		positions: Vector3[],
		spatialScale = 1,
	) {
		const markerScale = spatialScale * 0.65;
		positions.slice(0, 4).forEach((position, index) => {
			const color = index % 2 === 0 ? "#97f7d7" : "#ff9bd9";
			const point = new Group();
			point.name = `ChinaAlertPoint-${index + 1}`;
			point.position.copy(position);
			const body = new Group();
			body.position.z = 0.46 * markerScale;
			const geometry = new BufferGeometry();
			const facets = [
				[0, 0, 0.29],
				[0, 0, -0.34],
				[-0.25, 0, 0.1],
				[0, -0.2, 0.1],
				[0.25, 0, 0.1],
				[0, 0.2, 0.1],
			];
			const faces = [
				0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 2, 1, 3, 2, 1, 4, 3, 1, 5, 4, 1, 2, 5,
			];
			geometry.setAttribute(
				"position",
				new Float32BufferAttribute(
					faces.flatMap((vertex) =>
						facets[vertex].map((value) => value * markerScale),
					),
					3,
				),
			);
			geometry.computeVertexNormals();
			const pyramid = new Mesh(
				geometry,
				new MeshPhongMaterial({
					color,
					emissive: new Color(color).multiplyScalar(0.25),
					flatShading: true,
					shininess: 70,
					transparent: true,
					opacity: 0.96,
					depthWrite: false,
					depthTest: false,
				}),
			);
			body.add(
				pyramid,
				new LineSegments(
					new EdgesGeometry(geometry),
					new LineBasicMaterial({
						color: "#e9ffff",
						transparent: true,
						opacity: 0.48,
						depthTest: false,
					}),
				),
			);
			const ring = new Mesh(
				new TorusGeometry(0.28 * markerScale, 0.014 * markerScale, 6, 64),
				new MeshBasicMaterial({
					color: "#efffff",
					transparent: true,
					opacity: 0.95,
					blending: AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			);
			const pulse = new Mesh(
				new PlaneGeometry(1.35 * markerScale, 1.35 * markerScale),
				new ShaderMaterial({
					uniforms: {
						time: { value: 0 },
						offset: { value: index * 0.23 },
						color: { value: new Color(color) },
					},
					vertexShader:
						"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
					fragmentShader: `varying vec2 vUv;uniform float time;uniform float offset;uniform vec3 color;
					void main(){float phase=fract(time*.34+offset);vec2 p=vUv-.5;float d=length(p);
					float radius=.22+phase*.18;float wave=1.-smoothstep(.006,.018,abs(d-radius));
					float angle=fract(atan(p.y,p.x)/6.28318-time*.12+offset);
					float segments=smoothstep(.02,.04,fract(angle*3.))*(1.-smoothstep(.56,.60,fract(angle*3.)));
					float rim=(1.-smoothstep(.006,.014,abs(d-.29)))*segments;
					float halo=exp(-d*d*55.)*.48;
					gl_FragColor=vec4(mix(color,vec3(.87,.98,1.),.55),wave*(1.-phase)*.5+rim*.88+halo);
					#include <colorspace_fragment>}`,
					transparent: true,
					blending: AdditiveBlending,
					depthWrite: false,
					depthTest: false,
					side: DoubleSide,
				}),
			);
			const beamGeometry = new PlaneGeometry(
				0.42 * markerScale,
				0.48 * markerScale,
			);
			beamGeometry.translate(0, 0.24 * markerScale, 0);
			const beamMaterial = new ShaderMaterial({
				uniforms: { color: { value: new Color(color) } },
				vertexShader: `varying vec2 vUv;void main(){vUv=uv;
					gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying vec2 vUv;uniform vec3 color;
					void main(){float x=abs(vUv.x-.5);float fade=pow(clamp(1.-vUv.y,0.,1.),1.25);
					float glow=exp(-x*x*35.)*fade*.55;
					float core=exp(-x*x*700.)*fade;
					gl_FragColor=vec4(mix(color,vec3(1.),core),glow+core);
					#include <colorspace_fragment>}`,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				side: DoubleSide,
				blending: AdditiveBlending,
			});
			const beam = new Mesh(beamGeometry, beamMaterial);
			beam.rotation.x = Math.PI / 2;
			const beamPartner = beam.clone();
			beamPartner.rotation.y = Math.PI / 2;
			const glow = new Sprite(
				new SpriteMaterial({
					map: this.glowTexture(color),
					transparent: true,
					depthTest: false,
					depthWrite: false,
					blending: AdditiveBlending,
					opacity: 0.85,
				}),
			);
			glow.scale.setScalar(0.42 * markerScale);
			glow.position.z = 0.025 * markerScale;
			point.add(body, ring, pulse, beam, beamPartner, glow);
			point.traverse((object) => {
				if (
					object instanceof Mesh ||
					object instanceof LineSegments ||
					object instanceof Sprite
				)
					object.renderOrder = object === pyramid ? 15 : 14;
			});
			pointLayer.add(point);
			const texture = this.textureCanvas(384, 112, (context) => {
				context.scale(2, 2);
				context.fillStyle = index % 2 ? "#27102580" : "#03262980";
				context.fillRect(4, 5, 184, 46);
				context.strokeStyle = color;
				context.globalAlpha = 0.65;
				context.lineWidth = 1;
				context.strokeRect(4.5, 5.5, 183, 45);
				context.globalAlpha = 1;
				context.shadowColor = color;
				context.shadowBlur = 5;
				context.fillStyle = color;
				context.fillRect(4, 11, 2, 34);
				context.fillRect(186, 11, 2, 34);
				context.shadowBlur = 0;
				context.font = '600 28px "Alibaba PuHuiTi", "PingFang SC", sans-serif';
				context.textAlign = "center";
				context.textBaseline = "middle";
				context.fillStyle = "#f5ffff";
				context.fillText(`告警点#${index + 1}`, 96, 28);
			});
			const labelWidth = 1.7 * spatialScale;
			const labelHeight = (labelWidth * 112) / 384;
			const label = new Mesh(
				new PlaneGeometry(labelWidth, labelHeight).translate(
					0,
					labelHeight / 2,
					0,
				),
				new MeshBasicMaterial({
					map: texture,
					transparent: true,
					depthTest: true,
					depthWrite: false,
					toneMapped: false,
					side: DoubleSide,
				}),
			);
			label.name = `ChinaAlertLabel-${index + 1}`;
			// Stand the plate in the map's XZ plane, anchored just above the pyramid tip.
			label.rotation.x = Math.PI / 2;
			label.position.z = 0.6 * spatialScale;
			label.renderOrder = 20;
			label.raycast = () => undefined;
			label.userData.alertLabel = true;
			const edge = new Line(
				new BufferGeometry().setFromPoints([
					new Vector3(-labelWidth / 2, 0, 0),
					new Vector3(labelWidth / 2, 0, 0),
				]),
				new LineBasicMaterial({
					color,
					transparent: true,
					opacity: 0.65,
					depthWrite: false,
					toneMapped: false,
				}),
			);
			edge.renderOrder = 21;
			edge.raycast = () => undefined;
			label.add(edge);
			point.add(label);
			this.alertAnimations.push({
				point,
				body,
				pulse,
				label,
				edge,
				scale: markerScale,
				offset: index * 0.7,
			});
		});
	}

	private createHeat() {
		const clusters: [number, number, number, number][] = [
			[87.5, 42.3, 1.6, 0.58],
			[88.6, 35.7, 1.7, 0.73],
			[103.2, 34, 2.0, 0.95],
			[106.0, 33.4, 2.2, 0.78],
			[108.6, 32.5, 1.9, 1],
			[113.2, 28, 1.9, 0.92],
			[118, 30, 2.3, 0.82],
			[120.0, 40.5, 2.0, 0.95],
			[125.0, 44.5, 1.9, 0.72],
		];
		this.layers.heat.add(
			this.createHeatSurface(
				clusters.map(([lon, lat, size, intensity]) => ({
					position: this.point([lon, lat], CHINA_MAP_DEPTH + 0.015),
					size,
					intensity,
				})),
			),
		);
		this.createAlertPoints(this.layers.point, [
			this.point([127.5, 45.7], CHINA_MAP_DEPTH + 0.06),
			this.point([100.4, 25.3], CHINA_MAP_DEPTH + 0.06),
			this.point([114.4, 41.1], CHINA_MAP_DEPTH + 0.06),
			this.point([108.9, 36.4], CHINA_MAP_DEPTH + 0.06),
		]);
	}

	private async createGlobe(
		countries: FeatureCollection<Polygon | MultiPolygon>,
		china: FeatureCollection<Polygon | MultiPolygon>,
		outline: FeatureCollection<Polygon | MultiPolygon>,
	) {
		const texture = this.textureCanvas(2048, 1024, (context) => {
			context.fillStyle = "#041328";
			context.fillRect(0, 0, 2048, 1024);
			const drawFeature = (
				feature: MapFeature,
				fill: string,
				stroke: string,
			) => {
				context.fillStyle = fill;
				context.strokeStyle = stroke;
				context.lineWidth = 1.4;
				for (const polygon of polygonsOf(feature)) {
					context.beginPath();
					polygon.forEach((ring) => {
						ring.forEach((coordinate, index) => {
							const x = ((coordinate[0] + 180) / 360) * 2048;
							const y = ((90 - coordinate[1]) / 180) * 1024;
							if (index === 0) context.moveTo(x, y);
							else context.lineTo(x, y);
						});
					});
					context.closePath();
					context.fill("evenodd");
					context.stroke();
				}
			};
			countries.features.forEach((feature) => {
				drawFeature(feature, "#16446d", "#3682ac");
			});
			china.features
				.filter((feature) => feature.properties?.name)
				.forEach((feature) => {
					drawFeature(feature, "#3587b7", "#b8eeff");
				});
			context.strokeStyle = "rgba(29,86,124,.32)";
			context.lineWidth = 0.7;
			for (let longitude = 0; longitude <= 2048; longitude += 2048 / 24) {
				context.beginPath();
				context.moveTo(longitude, 0);
				context.lineTo(longitude, 1024);
				context.stroke();
			}
			for (let latitude = 0; latitude <= 1024; latitude += 1024 / 12) {
				context.beginPath();
				context.moveTo(0, latitude);
				context.lineTo(2048, latitude);
				context.stroke();
			}
		});
		this.globeMesh = new Mesh(
			new SphereGeometry(5.1, 160, 96),
			new MeshBasicMaterial({ map: texture }),
		);
		this.globeMesh.rotation.y = Math.PI * 0.94 + 0.6;
		this.globeMesh.rotation.x = Math.PI * 0.2;
		this.globe.add(this.globeMesh);
		Object.entries(this.globeLayers).forEach(([id, layer]) => {
			if (id === "scan") this.globe.add(layer);
			else this.globeMesh?.add(layer);
		});
		const loader = new TextureLoader();
		const textureResults = await Promise.allSettled([
			loader.loadAsync("/assets/images/blue/earth-day-8k.jpg"),
			loader.loadAsync("/assets/images/blue/earth-specular.jpg"),
			loader.loadAsync("/assets/images/blue/earth-clouds-8k.jpg"),
		]);
		const textures = textureResults.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const failure = textureResults.find(
			(result) => result.status === "rejected",
		);
		if (failure || this.destroyed) {
			textures.forEach((item) => {
				item.dispose();
			});
			if (failure) throw failure.reason;
			return;
		}
		const [surface, specular, clouds] = textures;
		textures.forEach((item) => {
			item.anisotropy = Math.min(
				8,
				this.renderer.capabilities.getMaxAnisotropy(),
			);
			this.disposableTextures.add(item);
		});
		surface.colorSpace = SRGBColorSpace;
		const old = this.globeMesh.material;
		(Array.isArray(old) ? old : [old]).forEach((material) => {
			material.dispose();
		});
		const material = new MeshBasicMaterial({ map: surface, color: "#e5f5ff" });
		material.onBeforeCompile = (shader) => {
			shader.vertexShader = shader.vertexShader
				.replace(
					"#include <common>",
					"#include <common>\nvarying vec3 vGlobeNormal;varying vec3 vGlobeView;",
				)
				.replace(
					"#include <begin_vertex>",
					"#include <begin_vertex>\nvGlobeNormal=normalize(mat3(modelMatrix)*normal);vGlobeView=cameraPosition-(modelMatrix*vec4(position,1.)).xyz;",
				);
			shader.uniforms.globeSpecular = { value: specular };
			shader.fragmentShader = shader.fragmentShader
				.replace(
					"#include <common>",
					"#include <common>\nvarying vec3 vGlobeNormal;varying vec3 vGlobeView;uniform sampler2D globeSpecular;",
				)
				.replace(
					"#include <map_fragment>",
					`#include <map_fragment>
				float sunlight=smoothstep(-.18,.68,dot(normalize(vGlobeNormal),normalize(vec3(.72,.62,.45))));
				float ocean=texture2D(globeSpecular,vMapUv).r;
				float detail=smoothstep(.06,.62,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
				vec3 land=mix(vec3(.028,.11,.20),vec3(.86,.91,.95),pow(detail,.82));
				vec3 water=mix(vec3(.002,.016,.060),vec3(.018,.18,.34),detail);
				diffuseColor.rgb=mix(land,water,smoothstep(.25,.75,ocean))*(.055+sunlight*1.12);
				diffuseColor.rgb+=texture2D(globeSpecular,vMapUv).r*pow(sunlight,6.)*vec3(.025,.08,.14);
				float horizon=pow(1.-max(dot(normalize(vGlobeNormal),normalize(vGlobeView)),0.),5.);
				diffuseColor.rgb+=vec3(.03,.27,.55)*horizon*(.25+sunlight*.75);`,
				);
		};
		this.globeMesh.material = material;
		this.globeClouds = new Mesh(
			new SphereGeometry(5.145, 160, 96),
			new ShaderMaterial({
				uniforms: { cloudMap: { value: clouds }, time: { value: 0 } },
				vertexShader: `varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
				void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);
				vView=cameraPosition-(modelMatrix*vec4(position,1.)).xyz;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `uniform sampler2D cloudMap;uniform float time;
				varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
				void main(){vec2 uv=vUv+vec2(time*.00012,sin(time*.025)*.0005);
				float density=smoothstep(.12,.82,texture2D(cloudMap,uv).r);
				float sunlight=smoothstep(-.22,.70,dot(normalize(vNormal),normalize(vec3(.72,.62,.45))));
				float edge=smoothstep(.01,.15,dot(normalize(vNormal),normalize(vView)));
				gl_FragColor=vec4(vec3(.77,.89,1.)*(.12+sunlight*.9),density*.43*edge);}`,
				transparent: true,
				depthWrite: false,
			}),
		);
		this.globeClouds.name = "globe-drifting-clouds";
		this.globeMesh.add(this.globeClouds);
		this.createGlobeScan();
		this.createGlobeFloatingRing();
		const spherical = (coordinates: [number, number], radius = 5.165) => {
			const longitude = ((coordinates[0] + 180) * Math.PI) / 180;
			const latitude = (coordinates[1] * Math.PI) / 180;
			return new Vector3(
				-radius * Math.cos(longitude) * Math.cos(latitude),
				radius * Math.sin(latitude),
				radius * Math.sin(longitude) * Math.cos(latitude),
			);
		};
		const provinceOutlineMaterial = new LineBasicMaterial({
			color: "#8ccce6",
			transparent: true,
			opacity: 0.48,
			blending: AdditiveBlending,
			depthWrite: false,
		});
		const coastMaterial = new LineBasicMaterial({
			color: "#77b7ce",
			transparent: true,
			opacity: 0.45,
			depthWrite: false,
		});
		const coastPositions: number[] = [];
		const gridPositions: number[] = [];
		const provincePositions: number[] = [];
		const appendSegments = (
			points: Vector3[],
			positions: number[],
			closed = true,
		) => {
			for (let index = 0; index < points.length - (closed ? 0 : 1); index++) {
				const start = points[index],
					end = points[(index + 1) % points.length];
				positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
			}
		};
		const addSegments = (
			positions: number[],
			material: LineBasicMaterial,
			group: Group,
		) => {
			group.add(
				new LineSegments(
					new BufferGeometry().setAttribute(
						"position",
						new Float32BufferAttribute(positions, 3),
					),
					material,
				),
			);
		};
		countries.features.forEach((feature) => {
			polygonsOf(feature).forEach((polygon) => {
				const ring = polygon[0];
				if (!ring || ring.length < 8) return;
				const points = ring.map((coordinates) =>
					spherical([coordinates[0], coordinates[1]], 5.151),
				);
				appendSegments(points, coastPositions);
			});
		});
		addSegments(coastPositions, coastMaterial, this.globeLayers.heat);
		const gridMaterial = new LineBasicMaterial({
			color: "#468ead",
			transparent: true,
			opacity: 0.1,
			depthWrite: false,
		});
		for (let longitude = -180; longitude < 180; longitude += 15) {
			const points: Vector3[] = [];
			for (let latitude = -89; latitude <= 89; latitude += 1)
				points.push(spherical([longitude, latitude], 5.148));
			appendSegments(points, gridPositions, false);
		}
		for (let latitude = -75; latitude <= 75; latitude += 15) {
			const points: Vector3[] = [];
			for (let longitude = -180; longitude <= 180; longitude += 1.5)
				points.push(spherical([longitude, latitude], 5.148));
			appendSegments(points, gridPositions);
		}
		addSegments(gridPositions, gridMaterial, this.globeLayers.region);
		outline.features.forEach((feature) => {
			polygonsOf(feature).forEach((polygon) => {
				const points = polygon[0].map((coordinate) =>
					spherical([coordinate[0], coordinate[1]], 5.174),
				);
				this.globeMesh?.add(
					new LineLoop(
						new BufferGeometry().setFromPoints(points),
						new LineBasicMaterial({
							color: new Color("#b7f2ff").multiplyScalar(1.3),
							transparent: true,
							opacity: 0.8,
							blending: AdditiveBlending,
							depthWrite: false,
						}),
					),
				);
			});
		});
		china.features.forEach((feature) => {
			if (!feature.properties?.name) return;
			polygonsOf(feature).forEach((polygon) => {
				const ring = polygon[0];
				if (!ring?.length) return;
				const points = ring.map((coordinate) =>
					spherical([coordinate[0], coordinate[1]]),
				);
				appendSegments(points, provincePositions);
			});
		});
		addSegments(
			provincePositions,
			provinceOutlineMaterial,
			this.globeLayers.region,
		);
		const destinations: { name: string; coordinates: [number, number] }[] = [
			{ name: "东京", coordinates: [139.7, 35.7] },
			{ name: "首尔", coordinates: [127, 37.5] },
			{ name: "乌兰巴托", coordinates: [106.9, 47.9] },
			{ name: "莫斯科", coordinates: [37.6, 55.8] },
			{ name: "巴黎", coordinates: [2.35, 48.85] },
			{ name: "阿布扎比", coordinates: [54.4, 24.5] },
			{ name: "开罗", coordinates: [31.2, 30] },
			{ name: "孟买", coordinates: [72.8, 19.1] },
			{ name: "新德里", coordinates: [77.2, 28.6] },
			{ name: "曼谷", coordinates: [100.5, 13.7] },
			{ name: "新加坡", coordinates: [103.8, 1.3] },
			{ name: "内比都", coordinates: [96.1, 19.7] },
			{ name: "马尼拉", coordinates: [121, 14.6] },
			{ name: "珀斯", coordinates: [115.9, -31.9] },
			{ name: "堪培拉", coordinates: [149.1, -35.3] },
			{ name: "雅加达", coordinates: [106.8, -6.2] },
		];
		const origin = spherical([116.4, 39.9]);
		const originGlow = new Sprite(
			new SpriteMaterial({
				map: this.glowTexture("#bafff4"),
				transparent: true,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		originGlow.scale.setScalar(0.7);
		originGlow.position.copy(origin.clone().multiplyScalar(1.01));
		this.globeLayers.scatter.add(originGlow);
		const originLabel = this.textSprite("北京", {
			plate: true,
			simplePlate: true,
			size: 30,
			width: 112,
			height: 64,
		});
		originLabel.material.depthTest = true;
		originLabel.scale.set(0.62, 0.32, 1);
		originLabel.position
			.copy(origin.clone().multiplyScalar(1.04))
			.add(new Vector3(0.18, 0.1, 0));
		this.globeLayers.scatter.add(originLabel);
		for (const radius of [0.1, 0.18, 0.26]) {
			const circle = new Mesh(
				new TorusGeometry(radius, 0.006, 8, 64),
				new MeshBasicMaterial({
					color: "#affffd",
					transparent: true,
					opacity: 0.8,
					blending: AdditiveBlending,
					depthWrite: false,
				}),
			);
			circle.position.copy(origin);
			circle.quaternion.setFromUnitVectors(
				new Vector3(0, 0, 1),
				origin.clone().normalize(),
			);
			this.globeLayers.scatter.add(circle);
			this.globePulseRings.push(circle);
		}
		destinations.forEach((destination) => {
			const end = spherical(destination.coordinates);
			const marker = new Sprite(
				new SpriteMaterial({
					map: this.glowTexture(),
					transparent: true,
					depthWrite: false,
					blending: AdditiveBlending,
				}),
			);
			marker.scale.setScalar(0.32);
			marker.position.copy(end);
			this.globeLayers.scatter.add(marker);
			const core = new Mesh(
				new SphereGeometry(0.024, 16, 12),
				new MeshBasicMaterial({
					color: new Color("#d9faff").multiplyScalar(1.6),
				}),
			);
			core.position.copy(end.clone().multiplyScalar(1.002));
			const ring = new Mesh(
				new TorusGeometry(0.065, 0.004, 6, 48),
				new MeshBasicMaterial({
					color: "#b8efff",
					transparent: true,
					opacity: 0.55,
					depthWrite: false,
					blending: AdditiveBlending,
				}),
			);
			ring.position.copy(end);
			ring.quaternion.setFromUnitVectors(
				new Vector3(0, 0, 1),
				end.clone().normalize(),
			);
			this.globeLayers.scatter.add(core, ring);
			const labelWidth = Math.max(108, destination.name.length * 31 + 24);
			const label = this.textSprite(destination.name, {
				plate: true,
				simplePlate: true,
				size: 30,
				width: labelWidth,
				height: 64,
			});
			label.material.depthTest = true;
			label.scale.set(labelWidth * 0.0055, 0.32, 1);
			label.position
				.copy(end.clone().multiplyScalar(1.04))
				.add(new Vector3(0.17, 0.14, 0));
			this.globeLayers.scatter.add(label);
		});
		this.freight = new GlobeFreight();
		this.globeLayers.flyline.add(this.freight.group);
		this.createGlobeRadiance();
		this.createGlobeBackground();
	}

	private createGlobeRadiance() {
		// The light fades completely by the scan sphere's outer silhouette.
		const glowRadius = GLOBE_SCAN_RADIUS;
		const texture = this.textureCanvas(512, 512, (context) => {
			const glow = context.createRadialGradient(256, 256, 0, 256, 256, 256);
			glow.addColorStop(0, "#208bec80");
			glow.addColorStop(0.82, "#208bec70");
			glow.addColorStop(0.86, "#157bdb4a");
			glow.addColorStop(0.92, "#116bd81a");
			glow.addColorStop(0.97, "#0c589008");
			glow.addColorStop(1, "#07509100");
			context.fillStyle = glow;
			context.fillRect(0, 0, 512, 512);
		});
		const radiance = new Sprite(
			new SpriteMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
				opacity: 0.65,
			}),
		);
		radiance.name = "globe-diffuse-radiance";
		radiance.scale.set(glowRadius * 2, glowRadius * 2, 1);
		this.globeRadiance = radiance;
		this.globe.add(radiance);
	}

	private createGlobeScan() {
		// The scan is a floating shell, clear of the 5.1-radius Earth and its clouds.
		const radius = GLOBE_SCAN_RADIUS;
		const uniforms = { time: { value: 0 } };
		const sweep = `uniform float time;
		float sweepHeight() {
			return mix(1.08, -1.96, min(mod(time, 6.) / 5.7, 1.));
		}
		float sweepFade() {
			float phase = mod(time, 6.);
			return smoothstep(0., .2, phase) * (1. - smoothstep(5.75, 5.95, phase));
		}`;
		this.globeScan = new Mesh(
			new SphereGeometry(radius, 160, 96),
			new ShaderMaterial({
				uniforms,
				vertexShader: `varying vec3 vPosition;
				void main() {
					vPosition = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
				}`,
				fragmentShader: `${sweep}
				varying vec3 vPosition;
				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
				}
				void main() {
					float height = vPosition.y / ${radius.toFixed(2)};
					float distance = height - sweepHeight();
					float trailFade = 1. - smoothstep(0., .9, max(distance, 0.));
					float trail = pow(trailFade, 1.4) * smoothstep(-.004, .014, distance);
					vec2 grid = vPosition.xy * vec2(16., 20.);
					vec2 cell = fract(grid);
					vec2 aa = max(fwidth(grid), vec2(.001));
					vec2 edge = min(cell, 1. - cell);
					float columns = 1. - smoothstep(.018, .018 + aa.x, edge.x);
					float rows = 1. - smoothstep(.016, .016 + aa.y, edge.y);
					float dash = (1. - smoothstep(.18, .18 + aa.x, abs(cell.x - .5)))
						* (1. - smoothstep(.08, .08 + aa.y, abs(cell.y - .5)));
					float pixels = dash * mix(.3, 1., hash(floor(grid)));
					float pattern = columns * .10 + rows * .035 + pixels * .42;
					float core = 1. - smoothstep(.002, .005 + fwidth(height), abs(distance));
					float glow = exp(-abs(distance) * 55.);
					float opacity = trail * (.025 + pattern * .62);
					opacity += core * .035 + glow * .035;
					gl_FragColor = vec4(vec3(.06, .43, .92), opacity * sweepFade());
				}`,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		this.globeScan.name = "globe-scan";
		this.globeScan.visible = !this.reducedMotion.matches;
		this.globeLayers.scan.add(this.globeScan);
	}

	private createGlobeFloatingRing() {
		// A faint cloud ring, with soft, uneven edges rather than a solid outline.
		this.globeFloatingRing = new Mesh(
			new PlaneGeometry(18, 18),
			new ShaderMaterial({
				uniforms: { time: { value: 0 } },
				vertexShader: `
				varying vec2 vPlane;
				void main() {
					vPlane = position.xy;
					vec3 p = vec3(position.x, -.25, position.y);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
				}`,
				fragmentShader: `
				uniform float time;
				varying vec2 vPlane;
				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
				}
				float noise(vec2 p) {
					vec2 i = floor(p), f = fract(p);
					f = f * f * (3. - 2. * f);
					return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
						mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
				}
				float mistNoise(vec2 p) {
					return noise(p) * .57 + noise(p * 2.03 + 4.1) * .28
						+ noise(p * 4.11 + 9.2) * .15;
				}
				void main() {
					float radius = length(vPlane);
					float distance = radius - ${GLOBE_ORBIT_RADIUS.toFixed(2)};
					if (abs(distance) > .95) discard;
					vec2 drift = vec2(time * .025, -time * .018);
					float cloud = mistNoise(vPlane * 2.8 + drift);
					float wisps = mistNoise(vPlane * 7.5 - drift * 1.3);
					float width = .16 + cloud * .17;
					float mist = exp(-pow((distance + (wisps - .5) * .08) / width, 2.));
					float rim = exp(-pow(distance / .055, 2.));
					float opacity = (mist * .065 + rim * .03) * (.45 + cloud * .55);
					opacity *= 1. - smoothstep(.65, .95, abs(distance));
					gl_FragColor = vec4(mix(vec3(.08, .31, .62),
						vec3(.19, .48, .79), wisps), opacity);
				}`,
				transparent: true,
				depthWrite: false,
				side: DoubleSide,
				forceSinglePass: true,
				blending: AdditiveBlending,
			}),
		);
		this.globeFloatingRing.name = "globe-floating-ring";
		// Keep the reference's shallow ellipse at home, then inherit all sphere motion.
		this.globeFloatingRing.rotation.set(
			GLOBE_HOME.x,
			GLOBE_HOME.y,
			GLOBE_HOME.z,
		);
		this.globeFloatingRing.quaternion.invert();
		this.globeFloatingRing.rotateX(0.12);
		// Use the sphere's transform so dragging, auto-rotation and reset stay in sync.
		this.globeMesh?.add(this.globeFloatingRing);
	}

	private createGlobeBackground() {
		let seed = 92731;
		const random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 4294967296;
		};
		const positions: number[] = [],
			colors: number[] = [];
		for (let index = 0; index < 380; index++) {
			positions.push(
				(random() - 0.5) * 45,
				(random() - 0.5) * 30,
				-5 - random() * 22,
			);
			const light = 0.3 + random() * 0.7;
			colors.push(light * 0.65, light * 0.8, light);
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
		geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
		this.globeEffects.add(
			new Points(
				geometry,
				new PointsMaterial({
					size: 0.045,
					map: this.glowTexture(),
					vertexColors: true,
					transparent: true,
					opacity: 0.75,
					depthWrite: false,
					blending: AdditiveBlending,
				}),
			),
		);
		for (let index = 0; index < 2; index++) {
			const points: Vector3[] = [];
			for (let step = 0; step <= 180; step++) {
				const angle = (step / 180) * Math.PI * 2;
				points.push(
					new Vector3(
						Math.cos(angle) * (7.8 + index),
						Math.sin(angle) * 0.28,
						Math.sin(angle) * (5.9 + index),
					),
				);
			}
			const orbit = new LineLoop(
				new BufferGeometry().setFromPoints(points),
				new LineBasicMaterial({
					color: index ? "#5cbdde" : "#c3e6ed",
					transparent: true,
					opacity: index ? 0.08 : 0.12,
					blending: AdditiveBlending,
					depthWrite: false,
				}),
			);
			orbit.rotation.z = index ? -0.2 : 0.04;
			this.globeEffects.add(orbit);
		}
	}

	private animate = () => {
		if (this.destroyed) return;
		const now = performance.now();
		const delta = Math.min((now - this.previousFrameTime) / 1000, 0.1);
		this.previousFrameTime = now;
		const seconds = (now - this.started) / 1000;
		if (this.view === "globe") {
			if (this.globeFloatingRing?.visible && !this.reducedMotion.matches)
				this.globeFloatingRing.material.uniforms.time.value = this.reducedMotion
					.matches
					? 0
					: seconds;
			if (this.globeScan && this.globeLayers.scan.visible) {
				this.globeScan.visible = !this.reducedMotion.matches;
				this.globeScan.material.uniforms.time.value = this.reducedMotion.matches
					? 0
					: seconds;
			}
			this.globeEffects.rotation.y = Math.sin(seconds * 0.06) * 0.08;
			this.globePulseRings.forEach((ring, index) => {
				const phase = (seconds * 0.52 + index / 3) % 1;
				ring.scale.setScalar(0.65 + phase * 1.25);
				(ring.material as MeshBasicMaterial).opacity = 0.48 * (1 - phase);
			});
			this.freight?.update(seconds);
			this.globeLayers.scatter.traverse((child) => {
				if (!(child instanceof Sprite)) return;
				const material = child.material;
				material.userData.referenceOpacity ??= material.opacity;
				material.opacity =
					material.userData.referenceOpacity * this.globeLabelOpacity;
			});
			if (
				this.globeMesh &&
				!this.dragStart &&
				!this.switchingView &&
				!this.angleTween?.isActive() &&
				!this.transitionTimeline?.isActive()
			)
				this.globeMesh.rotation.y += delta * 0.0015;
			if (this.globeClouds && !this.reducedMotion.matches) {
				this.globeClouds.rotation.y += delta * 0.009;
				this.globeClouds.material.uniforms.time.value = this.reducedMotion
					.matches
					? 0
					: seconds;
			}
		} else {
			for (const alert of this.alertAnimations) {
				if (!this.isVisible(alert.point)) continue;
				// At vertical top view retain only the physical edge, including off-centre points.
				alert.label.material.opacity = this.topView
					? Math.min(1, Math.max(0, (Math.PI / 2 - this.cameraPitch) / 0.2))
					: 1;
				alert.body.position.z =
					(0.46 +
						(this.reducedMotion.matches
							? 0
							: Math.sin(seconds * 2.1 + alert.offset) * 0.025)) *
					alert.scale;
				alert.body.rotation.z = this.reducedMotion.matches
					? alert.offset
					: seconds * 0.18 + alert.offset;
				alert.pulse.material.uniforms.time.value = this.reducedMotion.matches
					? 0
					: seconds;
			}
			this.sideMaterials.forEach((material) => {
				material.uniforms.time.value = this.reducedMotion.matches ? 0 : seconds;
			});
		}
		this.updateMapNames();
		this.mapEffects.update(
			seconds,
			this.reducedMotion.matches || this.view !== "china",
		);
		this.layerMotion.update();
		this.regionReveal.update();
		this.composer.render();
		this.cloudTransition.render(this.renderer, this.camera);
		this.updateMonitoringPoint();
		this.animationFrame = requestAnimationFrame(this.animate);
	};

	private updateMonitoringPoint() {
		const marker = this.activeMonitoringMarker;
		if (!marker) return;
		if (this.view !== "china" || !this.isVisible(marker)) {
			this.closeMonitoringPoint();
			return;
		}
		marker.getWorldScale(this.monitoringScale);
		this.monitoringOffset
			.set(0, 1, 0)
			.applyQuaternion(this.camera.quaternion)
			.multiplyScalar(this.monitoringScale.y * (1 - marker.center.y));
		marker
			.getWorldPosition(this.monitoringProjection)
			.add(this.monitoringOffset)
			.project(this.camera);
		const { x, y, z } = this.monitoringProjection;
		if (z < -1 || z > 1 || Math.abs(x) > 1 || Math.abs(y) > 1) {
			this.closeMonitoringPoint();
			return;
		}
		const position = {
			name: marker.userData.name as string,
			x: ((x + 1) / 2) * this.canvas.clientWidth,
			y: ((1 - y) / 2) * this.canvas.clientHeight - 4,
		};
		if (
			!this.monitoringPosition ||
			Math.abs(position.x - this.monitoringPosition.x) > 0.1 ||
			Math.abs(position.y - this.monitoringPosition.y) > 0.1
		) {
			this.monitoringPosition = position;
			this.callbacks.onMonitoringPoint?.(position);
		}
	}

	closeMonitoringPoint() {
		if (!this.activeMonitoringMarker) return;
		this.activeMonitoringMarker = undefined;
		this.monitoringPosition = undefined;
		this.callbacks.onMonitoringPoint?.(null);
	}

	private intersectRegion(event: PointerEvent) {
		const rect = this.canvas.getBoundingClientRect();
		this.pointer.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1,
		);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		return this.raycaster.intersectObjects(
			(this.drillPath.length ? this.detailMeshes : this.regionMeshes).filter(
				(mesh) => this.isVisible(mesh),
			),
			false,
		)[0]?.object as Mesh | undefined;
	}

	private setHovered(mesh: Mesh | undefined) {
		if (this.hoverMesh === mesh) return;
		if (this.hoverMesh)
			gsap.to(
				(this.hoverMesh.userData.top as ShaderMaterial).uniforms.hovered,
				{ value: 0, duration: 0.2, overwrite: true },
			);
		this.hoverMesh = mesh;
		if (mesh)
			gsap.to((mesh.userData.top as ShaderMaterial).uniforms.hovered, {
				value: 1,
				duration: 0.16,
				overwrite: true,
			});
		this.canvas.style.cursor = mesh ? "pointer" : "default";
	}

	private onPointerMove = (event: PointerEvent) => {
		if (this.switchingView || this.regionTransition) return;
		if (this.dragStart) {
			const dx = event.clientX - this.dragStart.x;
			const dy = event.clientY - this.dragStart.y;
			if (Math.hypot(dx, dy) > 5) this.dragStart.moved = true;
			if (this.view === "globe" && this.globeMesh) {
				if (this.dragStart.moved) this.topView = false;
				this.globeMesh.rotation.y += dx * 0.005;
				this.globeMesh.rotation.x += dy * 0.005;
			} else if (this.view === "china" && this.dragStart.moved) {
				this.mapRotation += dx * 0.005;
				this.cameraPitch = Math.max(
					0.38,
					Math.min(1.5, this.cameraPitch + dy * 0.004),
				);
				this.topView = false;
				this.updateMapRotation();
				this.updateCamera();
			}
			if (this.dragStart.moved) {
				this.dragStart.x = event.clientX;
				this.dragStart.y = event.clientY;
			}
		}
		if (this.view === "china" && !this.detailLoading)
			this.setHovered(this.intersectRegion(event));
	};

	private onPointerDown = (event: PointerEvent) => {
		if (this.switchingView || this.regionTransition) return;
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		this.dragStart = { x: event.clientX, y: event.clientY, moved: false };
	};

	private onPointerUp = (event: PointerEvent) => {
		if (this.switchingView || this.regionTransition) return;
		const moved = this.dragStart?.moved;
		this.dragStart = undefined;
		this.revealMapNames();
		if (!moved && this.view === "china") {
			this.intersectRegion(event);
			if (
				this.layers.point.visible ||
				this.layers.label.visible ||
				this.selectedRegion
			) {
				const marker = this.raycaster.intersectObjects(
					this.monitoringMarkers.filter((marker) => this.isVisible(marker)),
					false,
				)[0]?.object;
				if (marker) {
					if (marker === this.activeMonitoringMarker) {
						this.closeMonitoringPoint();
					} else {
						this.activeMonitoringMarker = marker as Sprite;
						this.monitoringPosition = undefined;
						this.updateMonitoringPoint();
					}
					return;
				}
			}
			this.closeMonitoringPoint();
			if (!this.detailLoading) {
				const mesh = this.intersectRegion(event);
				if (mesh) this.callbacks.onRegion?.(mesh.userData.name as string);
			}
		}
	};

	private onPointerLeave = () => {
		this.dragStart = undefined;
		this.setHovered(undefined);
		this.revealMapNames();
	};

	private onWheel = (event: WheelEvent) => {
		event.preventDefault();
		this.zoom(event.deltaY > 0 ? 0.92 : 1.08);
	};

	setLayer(layer: Layer, enabled: boolean) {
		this.layerEnabled[layer] = enabled;
		const objects = new Set<Object3D>([
			this.layers[layer],
			this.globeLayers[layer],
		]);
		if (this.drilledLayers[layer]) objects.add(this.drilledLayers[layer]!);
		if (layer === "scan" && this.globeFloatingRing)
			objects.add(this.globeFloatingRing);
		for (const root of this.regionTransition?.outgoing ?? []) {
			root.traverse((object) => {
				if (object.userData.blueLayer === layer) objects.add(object);
			});
		}
		for (const object of objects) {
			object.userData.blueLayer = layer;
			this.layerMotion.setVisible(object, enabled, this.reducedMotion.matches);
		}
		this.updateMonitoringPoint();
	}

	setFreightMode(mode: FreightMode, enabled: boolean) {
		this.freight?.setMode(mode, enabled);
	}

	private clearSubdivisions() {
		this.clearDetailGeometry();
		this.selectedRegion = undefined;
		this.drillPath.length = 0;
		this.drillViews.length = 0;
		this.detailZoom = 1;
		this.mapEffects.setRegion(0, 0, 15, CHINA_MAP_DEPTH);
		this.map.children.forEach((child) => {
			child.visible = true;
		});
		Object.values(this.layers).forEach((group) => {
			this.chinaRoot.add(group);
		});
		this.callbacks.onDrillChange?.([]);
	}

	private applyView(view: View) {
		this.stopCameraControls();
		this.clearSubdivisions();
		this.view = view;
		this.viewMix = view === "globe" ? 1 : 0;
		this.globeLabelOpacity = view === "globe" ? 1 : 0;
		this.mapLabelOpacity = 0;
		this.zoomLevel = 1;
		this.topView = false;
		this.cameraPitch = 0.72;
		this.cameraYaw = 0;
		this.mapRotation = 0;
		this.mapRotationCenter.set(0, 0);
		this.updateMapRotation();
		this.target.set(
			view === "china" ? 0.35 : 0,
			view === "globe" ? 0.25 : 0,
			0,
		);
		this.chinaRoot.visible = view === "china";
		this.chinaRoot.position.set(0, 0, 0);
		this.chinaRoot.scale.setScalar(1);
		this.map.visible =
			this.labels.visible =
			this.background.visible =
			this.orbitRing.visible =
				true;
		this.globe.visible = this.globeEffects.visible = view === "globe";
		if (this.globeMesh)
			this.globeMesh.rotation.set(GLOBE_HOME.x, GLOBE_HOME.y, GLOBE_HOME.z);
		this.updateCamera();
	}

	private stopViewTransition(notify = true) {
		this.viewTimeline?.kill();
		this.viewTimeline = undefined;
		this.switchingView = false;
		this.cloudTransition.clear();
		if (notify) this.callbacks.onTransitionChange?.(false);
	}

	setView(view: View) {
		if (this.destroyed) return;
		if (view !== this.view) {
			this.regionRequest++;
			this.detailLoading = false;
			this.finishRegionTransition();
		}
		if (view !== this.view || this.switchingView) this.stopCameraControls();
		if (!this.ready) {
			this.requestedView = view;
			return;
		}
		if (view === "china" && !this.chinaReady) {
			if (this.loadingView && this.requestedView === view) return;
			const request = ++this.viewLoadRequest;
			this.requestedView = view;
			this.loadingView = this.switchingView = true;
			this.callbacks.onTransitionChange?.(true);
			this.callbacks.onViewMotionChange?.("exit");
			void this.ensureChina()
				.then(() => {
					if (this.destroyed || request !== this.viewLoadRequest) return;
					this.loadingView = false;
					this.stopViewTransition(false);
					this.setView("china");
				})
				.catch((error) => {
					if (this.destroyed || request !== this.viewLoadRequest) return;
					console.error("中国地图加载失败", error);
					this.chinaLoadPromise = undefined;
					this.loadingView = false;
					this.requestedView = this.view;
					this.stopViewTransition();
					this.callbacks.onViewMotionChange?.("idle");
				});
			return;
		}
		if (this.loadingView) {
			this.viewLoadRequest++;
			this.loadingView = false;
			this.requestedView = view;
			this.stopViewTransition();
			this.callbacks.onViewMotionChange?.("idle");
		}
		if (this.switchingView && this.requestedView === view) return;
		if (!this.switchingView && this.view === view) return;
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		this.detailTimeline?.kill();
		this.labelTween?.kill();
		this.finishRegionTransition();
		this.stopViewTransition(false);
		this.requestedView = view;
		if (this.reducedMotion.matches) {
			this.applyView(view);
			this.callbacks.onViewChange?.(view);
			this.callbacks.onTransitionChange?.(false);
			this.callbacks.onViewMotionChange?.("idle");
			this.revealMapNames();
			return;
		}
		this.switchingView = true;
		this.callbacks.onTransitionChange?.(true);
		this.callbacks.onViewMotionChange?.("exit");
		// Keep the globe at its current size and pass the cloud bank on one clock.
		this.viewTimeline = gsap.timeline({
			onComplete: () => {
				this.stopViewTransition();
				this.callbacks.onViewMotionChange?.("enter");
				if (view === "china") this.mapEffects.restartEntrance(0.15);
				this.transitionTimeline?.play(0);
			},
		});
		if (this.view === "globe") {
			if (this.globeMesh) {
				const turn = Math.PI * 2;
				this.globeMesh.rotation.y =
					CHINA_GLOBE_FOCUS.y +
					((((this.globeMesh.rotation.y - CHINA_GLOBE_FOCUS.y + Math.PI) %
						turn) +
						turn) %
						turn) -
					Math.PI;
				this.viewTimeline.to(
					this.globeMesh.rotation,
					{ ...CHINA_GLOBE_FOCUS, duration: 1.25, ease: "power2.inOut" },
					0,
				);
			}
			this.viewTimeline.to(
				this,
				{
					globeLabelOpacity: 0.2,
					duration: 1.25,
					ease: "power2.inOut",
				},
				0,
			);
		} else {
			const dolly = { distance: 1 / this.zoomLevel };
			this.viewTimeline.to(
				dolly,
				{
					distance: 1,
					duration: 1.25,
					ease: "power2.inOut",
					onUpdate: () => {
						this.zoomLevel = 1 / dolly.distance;
						this.updateCamera();
					},
				},
				0,
			);
			this.viewTimeline.to(
				this.target,
				{
					x: 0.35,
					y: 0,
					z: 0,
					duration: 1.25,
					ease: "power2.inOut",
					onUpdate: () => this.updateCamera(),
				},
				0,
			);
			this.viewTimeline.to(
				this,
				{
					mapRotation: 0,
					mapLabelOpacity: 0.2,
					duration: 1.25,
					ease: "power2.inOut",
					onUpdate: () => {
						this.updateMapRotation();
						this.updateCamera();
					},
				},
				0,
			);
		}
		this.viewTimeline.to(
			this.cloudTransition.progress,
			{ value: 1, duration: 3.2, ease: "none" },
			0.9,
		);
		this.viewTimeline.call(
			() => {
				this.applyView(view);
				this.callbacks.onViewChange?.(view);
				this.prepareViewEntrance(view);
				if (view === "china") this.mapEffects.restartEntrance(1.75);
				// The cloud center is fully opaque at the style handoff.
				this.composer.render();
				this.cloudTransition.render(this.renderer, this.camera);
			},
			[],
			2.5,
		);
	}

	zoom(factor: number) {
		if (
			this.destroyed ||
			!this.ready ||
			this.switchingView ||
			this.regionTransition
		)
			return;
		this.restoreChinaEntrance();
		this.stopViewEntrance();
		this.transitionTimeline?.kill();
		const baseline = this.selectedRegion ? this.detailZoom : 1;
		const nextZoom = Math.max(
			0.48 * baseline,
			Math.min(2.6 * baseline, (this.zoomTarget ?? this.zoomLevel) * factor),
		);
		this.zoomTween?.kill();
		this.zoomTarget = nextZoom;
		this.zoomTween = gsap.to(this, {
			zoomLevel: nextZoom,
			duration: this.reducedMotion.matches ? 0 : 0.42,
			ease: "power2.out",
			onUpdate: () => this.updateCamera(),
			onComplete: () => {
				this.zoomTarget = undefined;
				this.zoomTween = undefined;
				this.revealMapNames();
			},
		});
	}

	reset() {
		if (this.destroyed || !this.ready) return;
		if (this.regionTransition) return;
		this.regionRequest++;
		this.detailLoading = false;
		if (this.loadingView) {
			this.viewLoadRequest++;
			this.loadingView = false;
			this.requestedView = this.view;
			this.stopViewTransition();
			this.callbacks.onViewMotionChange?.("idle");
		}
		if (this.switchingView) this.viewTimeline?.progress(1);

		this.topView = false;
		const target = this.selectedRegion
			? this.detailHomeTarget.clone()
			: new Vector3(
					this.view === "china" ? 0.35 : 0,
					this.view === "globe" ? 0.25 : 0,
					0,
				);
		this.transitionCamera(
			target,
			this.selectedRegion ? this.detailZoom : 1,
			1.15,
		);
		this.transitionTimeline?.to(
			this,
			{
				cameraPitch: 0.72,
				duration: this.reducedMotion.matches ? 0 : 1.15,
				ease: "power2.inOut",
				onUpdate: () => this.updateCamera(),
			},
			0,
		);
		if (this.view === "globe" && this.globeMesh) {
			const fullTurn = Math.PI * 2;
			this.globeMesh.rotation.y =
				GLOBE_HOME.y +
				((((this.globeMesh.rotation.y - GLOBE_HOME.y + Math.PI) % fullTurn) +
					fullTurn) %
					fullTurn) -
				Math.PI;
			this.transitionTimeline?.to(
				this.globeMesh.rotation,
				{
					...GLOBE_HOME,
					duration: this.reducedMotion.matches ? 0 : 1.15,
					ease: "power2.inOut",
				},
				0,
			);
		}
	}

	goBack() {
		if (!this.drillPath.length || this.switchingView) return;
		if (this.regionTransition) {
			this.pendingRegionBack = true;
			return;
		}
		this.regionRequest++;
		this.detailLoading = false;
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		const fromPose = this.getMapCameraPose();
		this.retainOutgoingRegion();
		const returnPose = this.drillViews.pop();
		this.drillPath.pop();
		const parent = this.drillPath.at(-1);
		if (parent) {
			this.showRegion(parent, returnPose);
		} else {
			this.applyView("china");
			this.requestedView = "china";
			this.restoreMapCameraPose(fromPose);
			this.prepareIncomingRegion(
				[
					...this.map.children.filter(
						(object) =>
							!object.userData.outgoingRegion &&
							object !== this.mapEffects.group,
					),
					this.labels,
					this.background,
					this.orbitRing,
					...Object.values(this.layers),
				],
				[this.labels, ...Object.values(this.layers)],
				CHINA_MAP_DEPTH,
			);
			this.transitionRegionCamera(new Vector3(0.35, 0, 0), 1, returnPose);
		}
	}

	setTopView() {
		if (
			this.destroyed ||
			!this.ready ||
			this.switchingView ||
			this.regionTransition
		)
			return;
		this.restoreChinaEntrance();
		this.stopViewEntrance();
		this.transitionTimeline?.kill();
		this.angleTween?.kill();
		this.topView = true;
		const options = {
			duration: this.reducedMotion.matches ? 0 : 0.85,
			ease: "power2.inOut",
			onUpdate: () => this.updateCamera(),
			onComplete: () => {
				this.angleTween = undefined;
				this.revealMapNames();
			},
		};
		if (this.view === "globe" && this.globeMesh) {
			this.angleTween = gsap.to(this.globeMesh.rotation, {
				x:
					Math.PI / 2 -
					Math.atan2(
						this.camera.position.y - this.target.y,
						this.camera.position.z - this.target.z,
					),
				z: 0,
				...options,
			});
		} else {
			this.angleTween = gsap.to(this, { cameraPitch: Math.PI / 2, ...options });
		}
	}

	getState() {
		return {
			view: this.view,
			region: this.selectedRegion ?? "",
			regionPath: this.drillPath.map((feature) =>
				String(feature.properties?.name),
			),
			regionCodes: this.drillPath.map((feature) =>
				Number(feature.properties?.adcode),
			),
			detailLoading: this.detailLoading,
			canDrill: this.detailMeshes.map((mesh) => ({
				name: mesh.userData.name,
				adcode: mesh.userData.feature.properties.adcode,
			})),
			freight: this.freight?.getState(),
			zoom: this.zoomLevel,
			topView: this.topView,
			rotation: this.mapRotation,
			ready: this.ready,
			chinaLoaded: this.chinaReady,
			loadingView: this.loadingView,
			mapLabelOpacity: this.mapLabelOpacity,
			renderSize: this.renderer.getSize(new Vector2()).toArray(),
			drawCalls: this.renderer.info.render.calls,
			requestedView: this.requestedView,
			resetScope: this.selectedRegion ?? this.view,
			viewTransitioning: this.switchingView,
			viewEntering: this.viewEntranceActive,
			cloudProgress: this.cloudTransition.progress.value,
			viewMix: this.viewMix,
			frameOpacity: this.regionTransition
				? 1 - this.regionTransition.progress
				: 0,
			transitionTextureBytes: 0,
			globeRotation: this.globeMesh?.rotation.toArray().slice(0, 3),
			cameraPosition: this.camera.position.toArray(),
			transitioning:
				this.switchingView ||
				this.regionTransition !== undefined ||
				(this.transitionTimeline?.isActive() ?? false) ||
				(this.zoomTween?.isActive() ?? false) ||
				(this.angleTween?.isActive() ?? false),
			layers: { ...this.layerEnabled },
			globeLayers: Object.fromEntries(
				Object.entries(this.globeLayers).map(([name, group]) => [
					name,
					{ visible: group.visible, objects: group.children.length },
				]),
			),
			subdivisionLabels: this.drilledLabels?.children.length ?? 0,
			visibleMonitoringPoints: this.monitoringMarkers.filter((marker) =>
				this.isVisible(marker),
			).length,
		};
	}

	private updateMapRotation() {
		const { x, y } = this.mapRotationCenter;
		const cosine = Math.cos(this.mapRotation),
			sine = Math.sin(this.mapRotation);
		// Keep the current region under the camera while rotating its geographic plane.
		this.map.position.x = x - (x * cosine - y * sine);
		this.map.position.z = -y + (x * sine + y * cosine);
		this.surrounding.rotation.z = this.mapRotation;
		this.surrounding.position.x = this.map.position.x;
		this.surrounding.position.z = this.map.position.z;
		this.map.rotation.z = this.mapRotation;
		this.labels.rotation.z = this.mapRotation;
		Object.values(this.layers).forEach((group) => {
			group.rotation.z = this.mapRotation;
		});
	}

	private isVisible(object: import("three").Object3D) {
		let current: import("three").Object3D | null = object;
		while (current) {
			if (!current.visible) return false;
			if (current === this.scene) return true;
			current = current.parent;
		}
		return false;
	}

	drilldown(name: string | number) {
		if (this.switchingView || this.detailLoading || this.regionTransition)
			return;
		const candidates = this.drillPath.length
			? this.detailMeshes
			: this.regionMeshes;
		const mesh = candidates.find(
			(region) =>
				this.isVisible(region) &&
				(Number(region.userData.feature?.properties?.adcode) === Number(name) ||
					region.userData.name === name ||
					shortName(region.userData.name) === shortName(String(name))),
		);
		if (!mesh) return;
		const feature = mesh.userData.feature as MapFeature;
		if (
			this.drillPath.at(-1)?.properties?.adcode === feature.properties?.adcode
		)
			return;
		void this.enterRegion(feature);
	}

	private async enterRegion(feature: MapFeature) {
		const request = ++this.regionRequest;
		const adcode = Number(feature.properties?.adcode);
		this.detailLoading = true;
		try {
			if (
				adcode &&
				Number(feature.properties?.childrenNum) > 0 &&
				!this.cityDataCache.has(adcode)
			) {
				const response = await fetch(`/geojson/blue/${adcode}.json`, {
					signal: this.abortController.signal,
				});
				if (response.ok) this.cityDataCache.set(adcode, await response.json());
			}
		} catch (error) {
			if (!this.destroyed && (error as Error).name !== "AbortError")
				console.error("行政区划读取失败", error);
		}
		if (
			this.destroyed ||
			request !== this.regionRequest ||
			this.view !== "china"
		)
			return;
		this.detailLoading = false;
		this.stopCameraControls();
		this.transitionTimeline?.kill();
		this.drillViews.push(this.getMapCameraPose());
		this.retainOutgoingRegion();
		this.drillPath.push(feature);
		this.showRegion(feature);
	}

	private clearDetailGeometry() {
		this.closeMonitoringPoint();
		this.detailLoading = false;
		this.setHovered(undefined);
		this.detailTimeline?.kill();
		this.detailTimeline = undefined;
		this.detailMeshes.length = 0;
		for (const child of [...this.map.children]) {
			if (!child.userData.drilldown) continue;
			this.disposeObject(child);
			this.map.remove(child);
		}
		this.drilledLabels = undefined;
		this.drilledPoints = undefined;
		this.drilledLayers = {};
	}

	private showRegion(feature: MapFeature, returnPose?: MapCameraPose) {
		this.stopCameraControls();
		const fromPose = this.getMapCameraPose();
		this.transitionTimeline?.kill();
		this.labelTween?.kill();
		if (!this.regionTransition) this.mapLabelOpacity = 0;
		this.clearDetailGeometry();
		this.selectedRegion = String(feature.properties?.name);
		this.view = "china";
		this.mapRotation = 0;
		this.topView = false;
		this.cameraPitch = 0.72;
		this.updateMapRotation();
		this.globe.visible = false;
		this.map.visible = true;
		if (!this.regionTransition)
			this.labels.visible =
				this.background.visible =
				this.orbitRing.visible =
					false;
		Object.values(this.layers).forEach((layer) => {
			this.chinaRoot.remove(layer);
		});
		this.map.children.forEach((child) => {
			if (!child.userData.outgoingRegion) child.visible = false;
		});
		const group = new Group();
		group.userData.drilldown = true;
		const coordinates = polygonsOf(feature).flatMap((polygon) =>
			polygon[0].map((coordinate) =>
				this.point([coordinate[0], coordinate[1]]),
			),
		);
		const rawWidth =
			Math.max(...coordinates.map((point) => point.x)) -
			Math.min(...coordinates.map((point) => point.x));
		const rawHeight =
			Math.max(...coordinates.map((point) => point.y)) -
			Math.min(...coordinates.map((point) => point.y));
		const precision = 0.004 * Math.min(1, Math.max(rawWidth, rawHeight) / 7.5);
		const mesh = new Mesh(
			new ExtrudeGeometry(this.shapes(feature, precision), {
				depth: CHINA_MAP_DEPTH,
				bevelEnabled: false,
				curveSegments: 1,
			}),
			[this.topMaterial(undefined, undefined, true), this.sideMaterial()],
		);
		mesh.userData = {
			name: this.selectedRegion,
			feature,
			top: mesh.material[0],
		};
		group.add(mesh);
		this.drilledLabels = new Group();
		this.drilledPoints = new Group();
		this.drilledLayers = {
			label: this.drilledLabels,
			point: this.drilledPoints,
			flyline: new Group(),
			scatter: new Group(),
			heat: new Group(),
		};
		for (const [id, layer] of Object.entries(this.drilledLayers)) {
			layer.userData.blueLayer = id;
			this.layerMotion.initialize(layer, this.layerEnabled[id as Layer]);
			group.add(layer);
		}
		this.map.add(group);
		mesh.geometry.computeBoundingBox();
		const bounds = mesh.geometry.boundingBox;
		if (!bounds) return;
		const center = bounds.getCenter(new Vector3());
		const size = bounds.getSize(new Vector3());
		const span = Math.max(size.x, size.y * 0.75, 0.000001);
		const spatialScale = Math.min(1, span / 7.5);
		const baseDepth = CHINA_MAP_DEPTH * spatialScale;
		(mesh.material[1] as ShaderMaterial).uniforms.wallScale.value =
			spatialScale;
		mesh.scale.z = spatialScale;
		const nextTarget = new Vector3(
			center.x,
			this.map.position.y + baseDepth * 0.6,
			-center.y,
		);
		const nextZoom = this.fitRegionZoom(mesh, nextTarget, spatialScale, span);
		group.userData.spatialScale = spatialScale;
		group.userData.baseDepth = baseDepth;
		group.userData.materialBounds = new Vector3(
			bounds.min.x,
			bounds.min.y,
			Math.max(size.x, size.y),
		);
		(mesh.userData.top as ShaderMaterial).uniforms.mapBounds.value.copy(
			group.userData.materialBounds,
		);
		group.userData.boundary = this.createBorderGlow(
			feature,
			group,
			baseDepth,
			spatialScale,
		);
		this.lines(
			feature,
			group,
			0.006 * spatialScale,
			"#c29a62",
			0.64,
			true,
			spatialScale,
		);

		this.mapEffects.setRegion(
			center.x,
			center.y,
			Math.max(size.x, size.y),
			baseDepth +
				(Number(feature.properties?.childrenNum) > 0
					? 0.006 * spatialScale
					: 0),
		);
		this.mapEffects.group.visible = true;
		group.userData.materialHeight = size.y;
		(mesh.userData.top as ShaderMaterial).uniforms.mapHeight.value = size.y;
		const parentCode = Number(this.drillPath.at(-2)?.properties?.adcode);
		const neighbours = parentCode
			? this.cityDataCache.get(parentCode)
			: this.chinaData;
		for (const neighbour of neighbours?.features ?? []) {
			if (neighbour.properties?.adcode === feature.properties?.adcode) continue;
			const context = new Mesh(
				new ShapeGeometry(this.shapes(neighbour, precision)),
				this.contextMaterial(
					new MeshBasicMaterial({
						color: "#10253b",
						transparent: true,
						opacity: 0.32,
						depthWrite: false,
					}),
				),
			);
			context.position.z = -0.07 * spatialScale;
			group.add(context);
			this.lines(
				neighbour,
				group,
				-0.06 * spatialScale,
				"#507d9c",
				0.58,
				true,
				spatialScale,
				true,
			);
			const neighbourCenter = (neighbour.properties?.centroid ??
				neighbour.properties?.center) as [number, number] | undefined;
			if (neighbourCenter && neighbour.properties?.name) {
				this.drilledLabels.add(
					this.mapName(
						String(neighbour.properties.name),
						this.point(neighbourCenter, -0.04 * spatialScale),
						false,
						12,
						"context",
					),
				);
			}
		}
		this.detailZoom = nextZoom;
		this.detailHomeTarget.copy(nextTarget);
		group.userData.focus = new Vector3(
			nextTarget.x,
			-nextTarget.z,
			baseDepth + 0.24 * spatialScale,
		);
		this.createDetailOverlays(feature, group, spatialScale, baseDepth);
		// Keep the camera's current angle until the same flight reaches its fitted view.
		this.restoreMapCameraPose(fromPose);
		const adcode = Number(feature.properties?.adcode);
		const hasChildren = Number(feature.properties?.childrenNum) > 0;
		if (adcode && hasChildren && this.cityDataCache.has(adcode)) {
			void this.loadSubdivisions(adcode, this.selectedRegion, group, false);
		} else {
			const label = this.mapName(
				this.selectedRegion,
				new Vector3(center.x, center.y, baseDepth + 0.018 * spatialScale),
				true,
			);
			this.drilledLabels.add(label);
		}
		this.prepareIncomingRegion(
			[group],
			Object.values(this.drilledLayers),
			baseDepth,
		);
		this.transitionRegionCamera(nextTarget, nextZoom, returnPose);
		this.callbacks.onDrillChange?.(
			this.drillPath.map((item) => String(item.properties?.name)),
		);
	}

	private sampleMap(feature: MapFeature, count: number, height: number) {
		const polygons = polygonsOf(feature).map((polygon) =>
			polygon.map((ring) =>
				ring.map((coordinate) =>
					this.point([coordinate[0], coordinate[1]], height),
				),
			),
		);
		const all = polygons.flatMap((polygon) => polygon[0]);
		const minX = Math.min(...all.map((p) => p.x)),
			maxX = Math.max(...all.map((p) => p.x));
		const minY = Math.min(...all.map((p) => p.y)),
			maxY = Math.max(...all.map((p) => p.y));
		const insideRing = (point: Vector3, ring: Vector3[]) => {
			let inside = false;
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const a = ring[i],
					b = ring[j];
				if (
					a.y > point.y !== b.y > point.y &&
					point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
				)
					inside = !inside;
			}
			return inside;
		};
		const result: Vector3[] = [];
		for (let i = 1; i < count * 100 && result.length < count; i++) {
			const point = new Vector3(
				minX + (maxX - minX) * (0.08 + ((i * 0.61803398875) % 1) * 0.84),
				minY + (maxY - minY) * (0.08 + ((i * 0.75487766625) % 1) * 0.84),
				height,
			);
			if (
				polygons.some(
					(polygon) =>
						insideRing(point, polygon[0]) &&
						!polygon.slice(1).some((hole) => insideRing(point, hole)),
				)
			)
				result.push(point);
		}
		return result;
	}

	private createDetailOverlays(
		feature: MapFeature,
		group: Group,
		scale: number,
		depth: number,
	) {
		const samples = this.sampleMap(feature, 38, depth + 0.045 * scale);
		if (!samples.length) return;
		const desiredFocus = group.userData.focus as Vector3;
		const focus = samples
			.reduce((best, point) =>
				point.distanceTo(desiredFocus) < best.distanceTo(desiredFocus)
					? point
					: best,
			)
			.clone();
		group.userData.focus = focus;
		this.drilledLayers.flyline?.add(this.mapEffects.focus(focus, scale));
		samples.forEach((point, index) => {
			this.drilledLayers.scatter?.add(
				this.mapEffects.scatter(point, (0.1 + (index % 3) * 0.025) * scale),
			);

			if (index >= 6) return;
			const info = this.mapEffects.info(point, index, scale);
			this.drilledPoints?.add(info.group, info.marker);
			this.monitoringMarkers.push(info.marker);
			if (focus.distanceTo(point) < 0.3 * scale) return;
			const middle = focus.clone().lerp(point, 0.5);
			middle.z += Math.max(focus.distanceTo(point) * 0.3, 0.4 * scale);
			this.drilledLayers.flyline?.add(
				this.mapEffects.flyline(
					new QuadraticBezierCurve3(focus, middle, point),
					scale,
					index,
				),
			);
		});
		this.drilledLayers.heat?.add(
			this.createHeatSurface(
				samples.slice(0, 10).map((point, index) => ({
					position: point.clone().setZ(depth + 0.018 * scale),
					size: (1.35 + (index % 3) * 0.24) * scale,
					intensity: 0.62 + (index % 4) * 0.12,
				})),
			),
		);
		if (this.drilledPoints)
			this.createAlertPoints(
				this.drilledPoints,
				samples.slice(10, 14),
				Math.min(scale, 1 / this.detailZoom),
			);
	}

	private async loadSubdivisions(
		adcode: number,
		name: string,
		group: Group,
		animate = true,
	) {
		const instant = this.reducedMotion.matches || !animate;
		try {
			let data = this.cityDataCache.get(adcode);
			if (!data) {
				const response = await fetch(`/geojson/blue/${adcode}.json`, {
					signal: this.abortController.signal,
				});
				if (!response.ok) return;
				data = (await response.json()) as FeatureCollection<
					Polygon | MultiPolygon
				>;
				this.cityDataCache.set(adcode, data);
			}
			if (
				this.destroyed ||
				this.selectedRegion !== name ||
				group.parent !== this.map
			)
				return;
			const detailTimeline = gsap.timeline({
				onComplete: () => this.revealMapNames(),
			});
			this.detailTimeline = detailTimeline;
			const spatialScale = Number(group.userData.spatialScale ?? 1);
			const baseDepth = Number(group.userData.baseDepth ?? CHINA_MAP_DEPTH);
			const detailDepth = 0.006 * spatialScale;
			const surface = baseDepth + detailDepth;
			const sideMaterial = this.sideMaterial(detailDepth, spatialScale);
			const boundary = group.userData.boundary as Group;
			// Keep the existing silhouette while subdivision details resolve.
			detailTimeline.to(
				boundary.position,
				{
					z: detailDepth,
					duration: instant ? 0 : 0.65,
					ease: "sine.inOut",
				},
				0,
			);

			data.features.forEach((feature, index) => {
				const shapes = this.shapes(feature, 0.012 * spatialScale);
				if (!shapes.length) return;
				const reveal = { value: instant ? 1 : 0 };
				const revealStart = instant ? 0 : Math.min(index * 0.008, 0.12);
				const face = new Mesh(
					new ExtrudeGeometry(shapes, {
						depth: detailDepth,
						bevelEnabled: false,
						curveSegments: 1,
					}),
					[
						this.topMaterial(
							group.userData.materialBounds as Vector3,
							Number(group.userData.materialHeight),
							true,
							reveal,
						),
						sideMaterial,
					],
				);
				face.userData = {
					name: String(feature.properties?.name),
					feature,
					top: face.material[0],
				};
				this.detailMeshes.push(face);
				face.material[0].transparent = true;
				face.material[0].depthWrite = false;
				face.position.z = baseDepth + 0.001 * spatialScale;
				face.scale.z = instant ? 1 : 0.8;
				group.add(face);
				detailTimeline.to(
					reveal,
					{
						value: 1,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				detailTimeline.to(
					face.scale,
					{
						z: 1,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				const lineMaterial = this.lines(
					feature,
					group,
					surface + 0.014 * spatialScale,
					"#c8f5ff",
					0.86,
					false,
					spatialScale,
				);
				lineMaterial.opacity = instant ? 0.86 : 0;
				detailTimeline.to(
					lineMaterial,
					{
						opacity: 0.86,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				const center = (feature.properties?.centroid ??
					feature.properties?.center) as [number, number] | undefined;
				if (!center) return;

				const label = this.mapName(
					String(feature.properties?.name),
					this.point(center, surface + 0.018 * spatialScale),
				);
				label.userData.mapName.reveal = reveal;
				this.drilledLabels?.add(label);
			});
		} catch (error) {
			if (!this.destroyed && (error as Error).name !== "AbortError")
				console.error("行政区划读取失败", error);
		} finally {
			if (group.parent === this.map) this.detailLoading = false;
		}
	}

	private disposeObject(root: Group | Mesh | import("three").Object3D) {
		this.layerMotion.forget(root);
		this.regionReveal.forget(root);
		this.mapEffects.forget(root);
		root.traverse((child) => {
			const surfaceLabelIndex = this.surfaceLabels.indexOf(
				child as Mesh<PlaneGeometry, MeshBasicMaterial>,
			);
			if (surfaceLabelIndex >= 0)
				this.surfaceLabels.splice(surfaceLabelIndex, 1);
			gsap.killTweensOf(child.scale);
			for (let index = this.alertAnimations.length - 1; index >= 0; index--) {
				if (this.alertAnimations[index].point === child)
					this.alertAnimations.splice(index, 1);
			}

			if (child instanceof Sprite) {
				const texture = child.material.map;
				if (texture && !this.sharedTextures.has(texture)) {
					texture.dispose();
					this.disposableTextures.delete(texture);
				}
				child.material.dispose();
				const index = this.monitoringMarkers.indexOf(child);
				if (index >= 0) this.monitoringMarkers.splice(index, 1);
			}
			if (
				child instanceof Mesh ||
				child instanceof Line ||
				child instanceof Points
			) {
				child.geometry.dispose();
				const materials = Array.isArray(child.material)
					? child.material
					: [child.material];
				materials.forEach((material) => {
					const texture = (material as MeshBasicMaterial).map;
					if (texture && !this.sharedTextures.has(texture)) {
						texture.dispose();
						this.disposableTextures.delete(texture);
					}
					if (material instanceof ShaderMaterial) {
						this.sideMaterials.delete(material);
						if (material.uniforms.hovered)
							gsap.killTweensOf(material.uniforms.hovered);
					}
					material.dispose();
				});
			}
		});
	}

	destroy() {
		this.destroyed = true;
		this.finishRegionTransition();
		this.layerMotion.dispose();
		this.regionReveal.dispose();
		this.cloudTransition.dispose();
		this.stopCameraControls();
		this.viewTimeline?.kill();
		this.transitionTimeline?.kill();
		this.detailTimeline?.kill();
		this.labelTween?.kill();
		this.mapEffects.dispose();
		this.surfaceLabels.length = 0;
		this.freight?.dispose();
		this.abortController.abort();
		cancelAnimationFrame(this.animationFrame);
		this.resizeObserver.disconnect();
		window.removeEventListener("resize", this.resize);
		this.canvas.removeEventListener("pointermove", this.onPointerMove);
		this.canvas.removeEventListener("pointerdown", this.onPointerDown);
		this.canvas.removeEventListener("pointerup", this.onPointerUp);
		this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
		this.canvas.removeEventListener("wheel", this.onWheel);
		this.canvas.style.cursor = "default";
		const geometries = new Set<BufferGeometry>();
		const materials = new Set<
			| MeshBasicMaterial
			| ShaderMaterial
			| LineBasicMaterial
			| SpriteMaterial
			| PointsMaterial
		>();
		const collect = (object: import("three").Object3D) => {
			if (
				object instanceof Mesh ||
				object instanceof Line ||
				object instanceof Points ||
				object instanceof Sprite
			) {
				if ("geometry" in object) geometries.add(object.geometry);
				const list = Array.isArray(object.material)
					? object.material
					: [object.material];
				list.forEach((material) => {
					materials.add(material as MeshBasicMaterial);
				});
			}
		};
		this.scene.traverse(collect);
		Object.values(this.layers).forEach((layer) => {
			layer.traverse(collect);
		});
		geometries.forEach((geometry) => {
			geometry.dispose();
		});
		materials.forEach((material) => {
			if (material instanceof ShaderMaterial && material.uniforms.hovered)
				gsap.killTweensOf(material.uniforms.hovered);
			material.dispose();
		});
		this.disposableTextures.forEach((texture) => {
			texture.dispose();
		});
		this.composer.passes.forEach((pass) => {
			pass.dispose();
		});
		this.composer.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}
}

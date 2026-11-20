import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type gsap from "gsap";
import {
	AmbientLight,
	Color,
	DirectionalLight,
	type Group,
	HalfFloatType,
	type Mesh,
	PerspectiveCamera,
	Raycaster,
	Scene,
	type Sprite,
	SRGBColorSpace,
	Vector2,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import CloudTransition from "../cloud-transition";
import LayerMotion from "../layer-motion";
import MapEffects from "../map-effects";
import ChinaScene from "./china";
import type { WorldControllers } from "./controller-types";
import MapGeometry from "./geometry";
import GlobeScene from "./globe";
import MapLabels from "./labels";
import MapOverlays from "./overlays";
import RegionTransition from "./region-transition";
import SceneTextures from "./textures";
import type {
	BlueWorldCallbacks,
	ChinaEntranceState,
	Layer,
	MapCameraPose,
	MapFeature,
	MonitoringPoint,
	View,
} from "./types";

/** Persistent resources and live values shared by the world controllers. */
export default class WorldState {
	readonly canvas: HTMLCanvasElement;
	readonly callbacks: BlueWorldCallbacks;
	readonly scene = new Scene();
	readonly camera = new PerspectiveCamera(36, 2.3, 0.1, 300);
	readonly renderer: WebGLRenderer;
	readonly composer: EffectComposer;
	readonly resizeObserver: ResizeObserver;
	readonly abortController = new AbortController();
	readonly geometry = new MapGeometry();
	readonly textures = new SceneTextures();
	readonly mapLabels = new MapLabels(this.textures);
	readonly overlays = new MapOverlays(this.textures);
	readonly mapEffects = new MapEffects();
	readonly chinaScene = new ChinaScene(
		this.geometry,
		this.textures,
		this.overlays,
		this.mapEffects,
		(name, position, leaf, pixels, variant) =>
			this.getControllers().frame.mapName(
				name,
				position,
				leaf,
				pixels,
				variant,
			),
	);
	readonly layerMotion = new LayerMotion();
	readonly regionGeometry: RegionTransition;
	regionRequest = 0;
	readonly layerEnabled: Record<Layer, boolean> = {
		flyline: false,
		label: false,
		point: false,
		scatter: false,
		heat: false,
		region: false,
		scan: false,
	};
	readonly cloudTransition = new CloudTransition();
	readonly cityDataCache = new Map<
		number,
		FeatureCollection<Polygon | MultiPolygon>
	>();
	readonly raycaster = new Raycaster();
	readonly pointer = new Vector2();
	readonly detailMeshes: Mesh[] = [];
	mapLabelOpacity = 0;
	labelTween: gsap.core.Tween | undefined;
	readonly drillPath: MapFeature[] = [];
	readonly drillViews: MapCameraPose[] = [];
	readonly mapRotationCenter = new Vector2();
	detailLoading = false;
	chinaReady = false;
	chinaLoadPromise: Promise<void> | undefined;
	loadingView = false;
	viewLoadRequest = 0;
	activeMonitoringMarker: Sprite | undefined;
	monitoringPosition: MonitoringPoint | undefined;
	readonly monitoringProjection = new Vector3();
	readonly monitoringScale = new Vector3();
	readonly monitoringOffset = new Vector3();
	chinaEntrance: ChinaEntranceState | undefined;
	chinaData: FeatureCollection<Polygon | MultiPolygon> | undefined;
	chinaOutline: FeatureCollection<Polygon | MultiPolygon> | undefined;
	readonly reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);
	readonly globeScene = new GlobeScene(this.textures, this.reducedMotion);
	transitionTimeline: gsap.core.Timeline | undefined;
	zoomTween: gsap.core.Tween | undefined;
	angleTween: gsap.core.Tween | undefined;
	zoomTarget: number | undefined;
	viewTimeline: gsap.core.Timeline | undefined;
	detailTimeline: gsap.core.Timeline | undefined;
	hoverMesh: Mesh | undefined;
	animationFrame = 0;
	started = performance.now();
	previousFrameTime = this.started;
	destroyed = false;
	view: View = "globe";
	requestedView: View = this.view;
	viewMix = 0;
	globeLabelOpacity = 0;
	switchingView = false;
	viewEntranceActive = false;
	ready = false;
	readonly detailHomeTarget = new Vector3();
	zoomLevel = 1;
	detailZoom = 1;
	topView = false;
	cameraPitch = 0.72;
	cameraYaw = 0;
	mapRotation = 0;
	selectedRegion: string | undefined;
	drilledLabels: Group | undefined;
	drilledPoints: Group | undefined;
	drilledLayers: Partial<Record<Layer, Group>> = {};
	cameraDistance = 34;
	readonly target = new Vector3(0.35, 0, 0);
	dragStart: { x: number; y: number; moved: boolean } | undefined;

	constructor(
		canvas: HTMLCanvasElement,
		callbacks: BlueWorldCallbacks,
		private readonly getControllers: () => WorldControllers,
	) {
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
		this.regionGeometry = new RegionTransition({
			china: this.chinaScene,
			scene: this.scene,
			camera: this.camera,
			renderer: this.renderer,
			mapEffects: this.mapEffects,
			layerMotion: this.layerMotion,
			callbacks: {
				closeMonitoringPoint: () =>
					this.getControllers().interaction.closeMonitoringPoint(),
				setHovered: (mesh) =>
					this.getControllers().interaction.setHovered(mesh),
				isVisible: (object) =>
					this.getControllers().interaction.isVisible(object),
				disposeObject: (object) =>
					this.getControllers().resources.disposeObject(object),
				getSelectedRegion: () => this.selectedRegion,
				isDestroyed: () => this.destroyed,
				goBack: () => this.getControllers().regions.goBack(),
				onLabelsReady: () => {
					this.mapLabelOpacity = 1;
				},
			},
		});
		this.scene.background = new Color("#020a17");
		this.scene.add(new AmbientLight(0xd4e8ff, 1.15));
		const sunlight = new DirectionalLight(0xe5f4ff, 3.2);
		sunlight.position.set(8, 9, 5);
		this.scene.add(sunlight);
		this.chinaScene.map.rotation.x = -Math.PI / 2;
		this.chinaScene.map.position.y = 0.16;
		this.chinaScene.labels.rotation.x = -Math.PI / 2;
		this.chinaScene.labels.position.copy(this.chinaScene.map.position);
		this.chinaScene.root.add(
			this.chinaScene.background,
			this.chinaScene.map,
			this.chinaScene.labels,
			this.chinaScene.orbitRing,
		);
		this.scene.add(
			this.chinaScene.root,
			this.globeScene.root,
			this.globeScene.effects,
		);
		this.chinaScene.root.visible = true;
		Object.values(this.chinaScene.layers).forEach((group) => {
			group.rotation.x = -Math.PI / 2;
			group.position.copy(this.chinaScene.map.position);
			this.chinaScene.root.add(group);
		});
		this.chinaScene.layers.heat.visible = false;
		this.chinaScene.layers.flyline.visible = false;
		this.chinaScene.layers.label.visible = false;
		this.chinaScene.layers.point.visible = false;
		this.chinaScene.layers.scatter.visible = false;
		this.chinaScene.layers.region.visible = false;
		this.globeScene.root.visible = false;
		this.resizeObserver = new ResizeObserver(() =>
			this.getControllers().camera.resize(),
		);
	}
}

/**
 * 大屏 3D 世界的共享状态容器：相机、场景、渲染器、后期合成、两套地图场景、
 * 下钻层级栈以及各类 GSAP 时间线都寄存在这里，被 BlueWorld 组装出的
 * camera/cameraMotion/view/regions/subdivisions/interaction/frame/resources 控制器共同读写。
 * 它不参与渲染循环，只回答「谁持有资源、谁复用缓存、销毁时释放什么」。
 */
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

/**
 * 世界场景的持久资源与活动状态。
 * 构造时一次性建好 WebGLRenderer、EffectComposer、中国/地球两套场景以及各几何、贴图工厂，
 * 之后所有控制器共享同一份实例：纹理只上传一次，下钻返回时也无需重建底层地图。
 * 字段大多是可被多个控制器改写的公共变量，修改前需确认没有正在播放的过渡动画在读它。
 */
export default class WorldState {
	/** 渲染目标画布，由 BlueWorld 传入；销毁时需一并解绑挂在上面的指针事件 */
	readonly canvas: HTMLCanvasElement;
	/** 通向 Solid 层的回调：视图切换、下钻路径、就绪与过渡状态 */
	readonly callbacks: BlueWorldCallbacks;
	/** 主场景根，中国与地球两套子场景都挂在这里，靠 visible 互斥显示 */
	readonly scene = new Scene();
	/** 透视相机：36° 垂直视场、初始宽高比 2.3，实际尺寸由 camera.resize 按容器更新 */
	readonly camera = new PerspectiveCamera(36, 2.3, 0.1, 300);
	/** WebGL 渲染器，像素比上限 2，避免高分屏下填充率过高 */
	readonly renderer: WebGLRenderer;
	/** 后期合成链：RenderPass → UnrealBloomPass → OutputPass */
	readonly composer: EffectComposer;
	/** 监听画布容器的尺寸变化，触发 camera.resize；销毁时 disconnect */
	readonly resizeObserver: ResizeObserver;
	/** 全场景共用的取消信号，销毁时 abort 所有在途的 GeoJSON 请求 */
	readonly abortController = new AbortController();
	/** GeoJSON → Shape / 顶点 / 材质 的投影与几何工具 */
	readonly geometry = new MapGeometry();
	/** 程序化贴图工厂（文字牌、辉光贴图），内部登记可释放的纹理 */
	readonly textures = new SceneTextures();
	/** 3D 文字标注工厂，与贴图工厂共享纹理缓存 */
	readonly mapLabels = new MapLabels(this.textures);
	/** 热力面与告警点等体量较大的叠加层工厂 */
	readonly overlays = new MapOverlays(this.textures);
	/** 飞线、聚焦圈、散点、信息点等轻量特效工厂 */
	readonly mapEffects = new MapEffects();
	/** 中国地图场景：省级立体块、各业务图层容器、地名与周边国家 */
	readonly chinaScene = new ChinaScene(
		this.geometry,
		this.textures,
		this.overlays,
		this.mapEffects,
		// 延迟取 frame.mapName：此刻控制器尚未构造完成，只能在标注真正创建时再回调
		(name, position, leaf, pixels, variant) =>
			this.getControllers().frame.mapName(
				name,
				position,
				leaf,
				pixels,
				variant,
			),
	);
	/** 图层显隐的渐变管理器，为材质注入 blueLayerReveal uniform 实现淡入淡出 */
	readonly layerMotion = new LayerMotion();
	/** 下钻边界过渡器：飞行期间同时持有旧几何与新几何，见 region-transition.ts */
	readonly regionGeometry: RegionTransition;
	/** 下钻请求令牌，每次下钻/返回/切视图自增，用来作废过期的异步结果 */
	regionRequest = 0;
	/** 图层开关的唯一事实来源，key 与 ChinaScene/GlobeScene 的 layers 容器一一对应 */
	readonly layerEnabled: Record<Layer, boolean> = {
		flyline: false,
		label: false,
		point: false,
		scatter: false,
		heat: false,
		region: false,
		scan: false,
	};
	/** 全球/中国切换时覆盖全屏的云层擦除，progress 从 0 涨到 1 完成交接 */
	readonly cloudTransition = new CloudTransition();
	/** 下一级行政区划缓存：adcode → GeoJSON；返回上级时刻意保留，避免反复请求 */
	readonly cityDataCache = new Map<
		number,
		FeatureCollection<Polygon | MultiPolygon>
	>();
	/** 指针拾取用的射线与归一化设备坐标（NDC，范围 -1~1） */
	readonly raycaster = new Raycaster();
	readonly pointer = new Vector2();
	/** 当前下钻层里可作为下一次下钻目标的网格，供 drilldown 按名称/编码匹配 */
	readonly detailMeshes: Mesh[] = [];
	/** 中国地图上所有地名的整体透明度，切视图/下钻时先归零再配合时间线抬起 */
	mapLabelOpacity = 0;
	/** 地名整体透明度补间句柄，重复过渡前先 kill，避免两条补间抢同一属性 */
	labelTween: gsap.core.Tween | undefined;
	/** 下钻层级栈：空数组＝全国，[省]＝省视图，[省, 市]＝市视图，以此类推 */
	readonly drillPath: MapFeature[] = [];
	/** 与 drillPath 同步的镜头姿态栈：进入某一级前的相机位姿，返回时用于还原视角 */
	readonly drillViews: MapCameraPose[] = [];
	/** 地图平面旋转的中心（世界坐标），保证下钻区域在旋转时留在镜头下 */
	readonly mapRotationCenter = new Vector2();
	/** 行政区数据请求进行中，用来屏蔽重复点击下钻 */
	detailLoading = false;
	/** 中国地图是否已构建完成；未完成时 setView("china") 会先走加载分支 */
	chinaReady = false;
	/** 中国地图的加载 Promise，重复调用 ensureChina 时复用，避免并发构建 */
	chinaLoadPromise: Promise<void> | undefined;
	/** 正在等待中国地图资源，期间切换视图要作废本次加载 */
	loadingView = false;
	/** 视图加载令牌，同 regionRequest，用于丢弃过期的加载回调 */
	viewLoadRequest = 0;
	/** 当前打开的监测点标记与它的经纬度、以及逐帧投影复用的临时向量 */
	activeMonitoringMarker: Sprite | undefined;
	monitoringPosition: MonitoringPoint | undefined;
	readonly monitoringProjection = new Vector3();
	readonly monitoringScale = new Vector3();
	readonly monitoringOffset = new Vector3();
	/** 中国地图入场动画的中间状态（原始缩放/透明度），被打断时据此还原 */
	chinaEntrance: ChinaEntranceState | undefined;
	/** 省级面数据与国界线数据，来自 resources.load，下钻时按需读取 */
	chinaData: FeatureCollection<Polygon | MultiPolygon> | undefined;
	chinaOutline: FeatureCollection<Polygon | MultiPolygon> | undefined;
	/** 系统「减少动态效果」偏好，所有补间都据此把时长降为 0 */
	readonly reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);
	/** 地球视图场景：球体、扫描光带、货运弧线与标签，独立于中国地图 */
	readonly globeScene = new GlobeScene(this.textures, this.reducedMotion);
	/** 镜头/下钻过渡、缩放、俯视角度补间；同一时刻只允许一条在跑 */
	transitionTimeline: gsap.core.Timeline | undefined;
	zoomTween: gsap.core.Tween | undefined;
	angleTween: gsap.core.Tween | undefined;
	zoomTarget: number | undefined;
	/** 全球/中国视图切换的时间线，由 view.setView 驱动，云层交接是其中一段 */
	viewTimeline: gsap.core.Timeline | undefined;
	/** 下钻子级的错峰入场时间线，返回上级时需 kill */
	detailTimeline: gsap.core.Timeline | undefined;
	/** 当前被射线命中的省/市网格，用于把上一个网格的悬停高亮 uniform 归位 */
	hoverMesh: Mesh | undefined;
	/** 渲染循环句柄、启动时刻与上一帧时刻（秒），frame 用它计算动画时间差 */
	animationFrame = 0;
	started = performance.now();
	previousFrameTime = this.started;
	/** 销毁标记：所有异步回调与逐帧逻辑都以此提前返回，避免访问已释放的对象 */
	destroyed = false;
	/** 当前视图与目标视图；requestedView 记录最近一次用户意图，加载失败时回滚 */
	view: View = "globe";
	requestedView: View = this.view;
	/** 0＝中国平面、1＝地球，camera.updateCamera 用它混合两套相机距离 */
	viewMix = 0;
	globeLabelOpacity = 0;
	/** 视图切换进行中，用于屏蔽重复点击与其它相机操作 */
	switchingView = false;
	/** 视图入场动画（地球自转/地图抬升）进行中 */
	viewEntranceActive = false;
	/** 首屏资源就绪；未就绪时视图请求只记录到 requestedView */
	ready = false;
	/** 当前下钻层的「归位」相机目标点，reset 时回到这里 */
	readonly detailHomeTarget = new Vector3();
	/** 当前相机缩放倍率；detailZoom 是该下钻层的基准倍率 */
	zoomLevel = 1;
	detailZoom = 1;
	/** 是否俯视（相机垂直于地图平面）以及相机的俯仰角、偏航角、地图自转角 */
	topView = false;
	cameraPitch = 0.72;
	cameraYaw = 0;
	mapRotation = 0;
	/** 当前下钻区域的名称（undefined＝全国），同时作为地图底衬显隐的判断依据 */
	selectedRegion: string | undefined;
	/** 下钻层自带的地名、信息点与业务图层容器，离开该层时整体置空 */
	drilledLabels: Group | undefined;
	drilledPoints: Group | undefined;
	drilledLayers: Partial<Record<Layer, Group>> = {};
	/** 中国视图的基准相机距离（世界坐标）与观察目标点 */
	cameraDistance = 34;
	readonly target = new Vector3(0.35, 0, 0);
	/** 指针按下起点，用于区分「点击下钻」和「拖拽旋转」 */
	dragStart: { x: number; y: number; moved: boolean } | undefined;

	/**
	 * 建好渲染管线与两套场景，并把它们挂成「中国默认可见、地球隐藏」的初始状态。
	 * @param canvas 渲染目标画布
	 * @param callbacks 向 Solid 层回传状态的回调集合
	 * @param getControllers 延迟取控制器：构造期控制器还没建好，只能在回调里按需调用
	 */
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
		// 像素比封顶 2：4K 屏上再往上翻只会让填充率成倍增加，画面收益极小
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = SRGBColorSpace;
		// 半浮点目标保留辉光的高光区间，samples 取硬件上限内的 4 倍 MSAA
		this.composer = new EffectComposer(
			this.renderer,
			new WebGLRenderTarget(1, 1, {
				type: HalfFloatType,
				samples: Math.min(4, this.renderer.capabilities.maxSamples),
			}),
		);
		this.composer.setPixelRatio(this.renderer.getPixelRatio());
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		// 阈值 1.12 只让最亮的描边与光带起辉，避免整幅地图发灰
		this.composer.addPass(
			new UnrealBloomPass(new Vector2(1280, 556), 0.34, 0.22, 1.12),
		);
		this.composer.addPass(new OutputPass());
		// 过渡器需要中国场景、渲染器与若干控制器能力，用回调形式注入以免循环依赖
		this.regionGeometry = new RegionTransition({
			china: this.chinaScene,
			scene: this.scene,
			camera: this.camera,
			renderer: this.renderer,
			mapEffects: this.mapEffects,
			layerMotion: this.layerMotion,
			// 过渡器在收尾时需要关闭监测点、清理悬停、释放旧网格，只能反向回调控制器
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
		// 环境光压平整体明暗，平行光从右上前方给立体侧面制造方向感
		this.scene.add(new AmbientLight(0xd4e8ff, 1.15));
		const sunlight = new DirectionalLight(0xe5f4ff, 3.2);
		sunlight.position.set(8, 9, 5);
		this.scene.add(sunlight);
		// GeoJSON 的 xy 平面绕 x 轴转 -90° 后铺到场景 XZ 平面，此后 z 分量即「离地高度」
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
		// 业务图层与地图共用同一套旋转变换，否则装饰物会浮在错误的平面上
		Object.values(this.chinaScene.layers).forEach((group) => {
			group.rotation.x = -Math.PI / 2;
			group.position.copy(this.chinaScene.map.position);
			this.chinaScene.root.add(group);
		});
		// 初始只展示底图；图层开关全部关闭时，装饰物不参与首屏绘制也不产生深度冲突。
		// scan 图层由地球侧的扫描光带共用开关（见 WorldView.setLayer），此处保持默认可见性。
		this.chinaScene.layers.heat.visible = false;
		this.chinaScene.layers.flyline.visible = false;
		this.chinaScene.layers.label.visible = false;
		this.chinaScene.layers.point.visible = false;
		this.chinaScene.layers.scatter.visible = false;
		this.chinaScene.layers.region.visible = false;
		this.globeScene.root.visible = false;
		// 尺寸变化走 camera.resize：它同时同步 renderer、composer 与相机基准距离，
		// 因此这里只观察容器，不在回调里自己算尺寸
		this.resizeObserver = new ResizeObserver(() =>
			this.getControllers().camera.resize(),
		);
	}
}

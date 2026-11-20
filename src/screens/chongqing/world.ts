/**
 * 重庆市 3D 场景编排：投影参数、地图分层、光柱、飞线、散点、监测点与入场时间轴。
 * 继承 shared/map 的 WorldCore（相机 / 渲染器 / 时钟），由 Map3D 在资源加载完成后实例化，
 * 每帧调用 update；画面中所有几何都走同一套墨卡托投影（geoProjection），保证与 GeoJSON 边界对齐。
 */
import { geoMercator } from "d3-geo";
import gsap from "gsap";
import {
	AdditiveBlending,
	BoxGeometry,
	Color,
	Fog,
	Group,
	LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	MeshStandardMaterial,
	type Object3D,
	type Object3DEventMap,
	PointsMaterial,
	RepeatWrapping,
	Sprite,
	SpriteMaterial,
	type Texture,
	Vector3,
	type Vector3Like,
} from "three";
import { InteractionManager } from "three.interactive";
import labelIcon from "/texture/label-icon.png";
import type Assets from "../../shared/map/assets";
import type { MapWorldOptions } from "../../shared/map/map-3d";
import {
	createBarHalo,
	createGlowPillar,
	createRotationBorders,
} from "../../shared/map/scene/accents";
import {
	createMapBlurLine,
	createMapDiffuse,
	createMapGrid,
	createMapOcean,
} from "../../shared/map/scene/background";
import { createMapEnvironment } from "../../shared/map/scene/environment";
import {
	createBarLabel,
	createMapLabels,
	createMonitoringLabel,
} from "../../shared/map/scene/labels";
import {
	populateMapFlyLines,
	populateMapScatter,
} from "../../shared/map/scene/layers";
import { createMapMaterials } from "../../shared/map/scene/materials";
import type { MapFocusLabelInfo as WorldMapFocusLabelInfo } from "../../shared/map/scene/types";
import { sortByValue } from "../../shared/map/utils/sort-by-value";
import WorldCore from "../../shared/map/world-core";
import BaseMap from "../../shared/map/world-core/components/base-map";
import ExtrudeMap from "../../shared/map/world-core/components/extrude-map";
import Focus from "../../shared/map/world-core/components/focus";
import Label3D, {
	type Label,
} from "../../shared/map/world-core/components/label-3d";
import Line from "../../shared/map/world-core/components/line";
import Particles from "../../shared/map/world-core/components/particles";
import GradientShader from "../../shared/map/world-core/shader/gradient-shader";
import chinaData from "./data/china-decoration";
import infoData from "./data/info";
import provincesData from "./data/regions";
import scatterData from "./data/scatter";

/** 经纬度点，顺序为 [经度, 纬度]，东经 / 北纬为正，与 d3-geo 的入参一致 */
export type Point = [number, number];

/**
 * 地图中心主标签：中文名、英文名与大号标题的落点。
 * center 并非投影中心，而是标签锚点，纬度 28.15 已贴近重庆南界（版图重心约 30.1），
 * 标题实际落在版图南缘附近。
 */
const defaultMapFocusLabelInfo: WorldMapFocusLabelInfo = {
	name: "重庆市",
	enName: "CHONGQING MUNICIPALITY",
	center: [107.744318, 28.15],
};

/**
 * 按 165 比例投影后，重庆地图的横向跨度约为 14.14 世界单位。
 * 顶面材质（createMapMaterials）用它把横向坐标归一化到 0~1 再做渐变配色，
 * 所以这里必须与 _geoProjectionScale 对应的实际跨度保持一致，改动缩放时要同步改这个值。
 */
const MAP_WIDTH = 14.14;

/**
 * 重庆市地图场景。
 *
 * 组成顺序：背景层（渐变遮罩、模糊边线、网格、旋转圆环）→ 全国底图 → 重庆拉伸体 →
 * 光柱与光晕 → 飞线与焦点 → 粒子 / 散点 / 监测点 → 轮廓流光 → 入场时间轴。
 * 所有坐标都由 geoProjection 投影到同一平面，再绕 X 轴旋转 -90° 立起来，
 * 因此层级靠 position.z 与 renderOrder 区分，而不是靠 y。
 */
export default class World extends WorldCore {
	/** 资源句柄，用于取 GeoJSON、贴图；构造时可能为空，取资源前需判空 */
	private readonly _assets?: Assets;
	/** three.interactive 的射线拾取管理器，事件元素注册与每帧 update 都在这里 */
	private readonly _interactionManager: InteractionManager;

	/** 墨卡托投影中心 [经度, 纬度]，取重庆地理中心，使投影结果以原点为对称中心 */
	private _geoProjectionCenter: Point;
	/** 投影缩放（像素 / 弧度），165 时重庆横向约 14.14 世界单位，正好落在相机视野内 */
	private _geoProjectionScale: number;
	/** 飞线汇聚点 [经度, 纬度]，取渝中区中心，与 regions.ts 中渝中区 center 一致 */
	private _flyLineCenter: Point;
	/** 地图拉伸高度（世界单位），同时决定光柱、标签、轮廓的 z 基准 */
	private _depth: number;
	/** 中心主标签信息，默认重庆；后续如需切屏可整体替换 */
	private _mapFocusLabelInfo: WorldMapFocusLabelInfo;
	/** 监测点按下标记，防止一次点击在 mousedown / mouseup 之间重复触发轮播 */
	private _clicked: boolean;

	/** CSS3D 标签挂载组，绕 X 轴放平以贴合地图平面 */
	private _labelGroup!: Group;
	/** 标签渲染器，负责把 DOM 投影成 3D 位置，destroy 时必须显式销毁 */
	private _label3d!: Label3D;
	/** 飞线汇聚点的光圈组，入场尾段才显示 */
	private _flyLineFocusGroup!: Group;

	/** 参与射线拾取的区县顶面 mesh，来自 mapTop 的子节点 */
	private _eventElement!: Object3D[];
	/** 区县默认材质，hover 结束后回填 */
	private _defaultMaterial: MeshStandardMaterial | null = null;
	/** 区县高亮材质，hover 时替换；是默认材质的克隆，避免影响未悬停的区域 */
	private _defaultLightMaterial: MeshStandardMaterial | null = null;

	/** 两层旋转装饰圆环，入场时从 0 缩放到 1 */
	private _rotateBorder1: Mesh | null = null;
	private _rotateBorder2: Mesh | null = null;
	/** 重庆主体分组：拉伸体、顶面、边线、轮廓流光都挂在它下面，入场时整体放大 */
	private _focusMapGroup: Group | null = null;

	/** 拉伸体顶面材质，入场时把 opacity 从初始值补到 1 */
	private _focusMapTopMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	/** 拉伸体侧面材质，透明度补完后关掉 transparent 以恢复深度写入 */
	private _focusMapSideMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	/** 顶面白色描边材质，初始 opacity 为 0，入场时淡入 */
	private _mapLineMaterial: LineBasicMaterial | null = null;
	/** 光柱分组，整体绕 X 轴放平 */
	private _barGroup: Group | null = null;
	/** 光柱 mesh，入场时逐个把 z 轴 scale 从 0 拉到 1 */
	private _allBar: Mesh[] = [];
	/** 与 _allBar 一一对应的材质，用于同步淡入 */
	private _allBarMaterial: MeshBasicMaterial[] = [];
	/** 光柱底部的光环组，children[0] / children[1] 分别是两层圆环 */
	private _allGuangquan: Group[] = [];
	/** 光柱数值标签，入场时同时做位移淡入与数字滚动 */
	private _allProvinceLabel: Label[] = [];
	/** 最近一次创建的光环组，仅作引用保留 */
	private _quanGroup: Group | null = null;
	/** 行政区装饰标签（含中心主标签与图标），入场时错峰淡入 */
	private _otherLabel: Label[] = [];
	/** 飞线组，初始隐藏，重庆主体放大完成后才显示 */
	private _flyLineGroup: Group | null = null;
	/** 上升粒子系统 */
	private _particles: Particles | null = null;
	/** 粒子挂载组，同样绕 X 轴放平 */
	private _particleGroup: Group | null = null;
	/** 散点层，初始隐藏 */
	private _scatterGroup: Group | null = null;
	/** 监测点层，初始隐藏 */
	private _infoPointGroup: Group | null = null;
	/** 监测点标签，点击或轮播时只显示其中一个 */
	private _infoLabelElement: Label[] = [];
	/** 当前显示的监测点标签下标，轮播时自增取模 */
	private _infoPointIndex: number = 0;
	/** 场景主时间轴，play 之前处于 pause，destroy 时 kill */
	private _animateTl: gsap.core.Timeline | null = null;
	/** 监测点标签轮播定时器，destroy 时必须 clear，否则切屏后仍操作已卸载的 DOM */
	private _infoPointLabelTime: ReturnType<typeof setInterval> | null = null;
	/** 场景动画播完的回调，由 Map3D 传入以衔接 UI 入场 */
	private readonly _onPlayComplete?: () => void;

	/**
	 * 构造场景并立即搭建所有元素（构造期不播放动画）。
	 * @param canvas 渲染画布，同时作为 raycast 的命中元素
	 * @param assets 已加载完成的资源句柄
	 * @param options onPlayComplete 回调，在时间轴尾段触发
	 */
	constructor(
		canvas: HTMLCanvasElement,
		assets?: Assets,
		options: MapWorldOptions = {},
	) {
		super(canvas);
		this._onPlayComplete = options.onPlayComplete;
		// 投影中心取重庆腹地（107.74°E, 30.20°N），使全市轮廓大致以原点为中心展开；
		// 若取东部区县会导致西侧区县被推到画面外
		this._geoProjectionCenter = [107.744318, 30.201983];
		// 165 是试出来的适配值：再大地图会顶到左右图表列，再小则光柱与标签挤在一起
		this._geoProjectionScale = 165;
		// 飞线从渝中区出发，向四周区县发散
		this._flyLineCenter = [106.56288, 29.556742];
		// 0.5 的厚度既能看出体积，又不会在俯视角下遮住侧面的区块分界
		this._depth = 0.5;
		this._mapFocusLabelInfo = defaultMapFocusLabelInfo;
		this._clicked = false;
		this.scene.fog = new Fog(0x102736, 1, 50); // 雾：近端 1 保留细节，远端 50 把外围底图融进背景色
		this.scene.background = new Color(0x102736); // 背景：与雾同色，避免远处出现硬边
		this.camera.instance.position.set(
			-13.767695123014105,
			12.990152163077308,
			39.28228164159694,
		); // 相机初始位置：大屏开场用，时间轴第一段会补到正视角度
		this.camera.instance.near = 1;
		this.camera.instance.far = 10000;
		this.camera.instance.updateProjectionMatrix();
		this._interactionManager = new InteractionManager(
			this.renderer.instance,
			this.camera.instance,
			canvas,
		); // 交互管理：绑定 renderer 与相机，鼠标事件才能命中 3D 对象
		this._assets = assets;
		this.initEnvironment();
		this.init();
	}

	/** 场景主时间轴，外部（Map3D）在 play 时直接调用 play() */
	get animateTl() {
		return this._animateTl as gsap.core.Timeline;
	}

	/**
	 * 搭建场景。顺序有依赖：标签组与飞线焦点组要先建，后面创建光柱、飞线、监测点时才能挂载；
	 * 地图要早于光柱（光柱位置依赖投影与 _depth）；时间轴必须最后创建，才能收集到全部元素。
	 */
	private init() {
		// 标签组：CSS3D 标签本身是竖直的 DOM 平面，绕 X 轴 -90° 后与地图平面重合
		this._labelGroup = new Group();
		this._label3d = new Label3D({
			canvas: this.canvas,
			sizes: this.sizes,
			scene: this.scene,
			camera: this.camera,
			time: this.time,
		});
		this._labelGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._labelGroup);
		// 飞线焦点光圈组：初始隐藏，等主体放大与飞线出现后才亮起，避免抢开场镜头
		this._flyLineFocusGroup = new Group();
		this._flyLineFocusGroup.visible = false;
		this._flyLineFocusGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._flyLineFocusGroup);
		// 区域事件元素：createProvince 里收集的顶面 mesh，稍后统一注册拾取
		this._eventElement = [];
		// 鼠标移上移除的材质：hover 时整体换材质，移出时换回，见 createEvent
		this._defaultMaterial = null; // 默认材质
		this._defaultLightMaterial = null; // 高亮材质

		// 先铺氛围层（底图渐变、模糊边线、网格、旋转圆环），再叠地图与业务图层
		this.createBottomBg();
		this.createChinaBlurLine();
		this.createGrid();
		this.createRotateBorder();
		this.createLabel();
		// 地图层：全国底图 + 重庆拉伸体；createBar 内部依赖已算好的 _depth
		this.createMap();
		this.createEvent();
		// 业务图层：飞线、散点、监测点都是相对投影中心计算，需在地图之后
		this.createFlyLine();
		this.createFocus();
		this.createParticles();
		this.createScatter();
		this.createInfoPoint();
		this.createStorke();
		// 时间轴最后创建，才能抓到前面所有 mesh / material / label 的引用
		this.createAnimationTimeline();
	}

	/** 初始化环境光 */
	private initEnvironment() {
		createMapEnvironment(this.scene);
	}

	/**
	 * 创建地图主体：全国底图（暗色面 + 边线）压在最下面，
	 * 重庆市拉伸体单独放在 focusMapGroup 里，初始 z 缩放为 0，等待入场时间轴拉开。
	 */
	private createMap() {
		const mapGroup = new Group();
		const focusMapGroup = new Group();
		this._focusMapGroup = focusMapGroup;
		const { china, chinaTopLine } = this.createChina();
		const { map, mapTop, mapLine } = this.createProvince();
		china.setParent(mapGroup);
		chinaTopLine.setParent(mapGroup);
		// 创建扩散：以地图中心为圆心的呼吸光晕，铺在底图下方
		this.createDiffuse();
		map.setParent(focusMapGroup);
		mapTop.setParent(focusMapGroup);
		mapLine.setParent(focusMapGroup);
		// z 方向微调 -0.01，避免与全国底图共面产生 z-fighting；
		// 缩放 z 置 0 是「压扁」的初始态，时间轴里再补回 1 形成生长感
		focusMapGroup.position.set(0, 0, -0.01);
		focusMapGroup.scale.set(1, 1, 0);
		mapGroup.add(focusMapGroup);
		// 整组绕 X 轴 -90°：投影结果是平面坐标（y 轴朝下），旋转后与屏幕水平面平行
		mapGroup.rotation.x = -Math.PI / 2;
		mapGroup.position.set(0, 0.2, 0);
		this.scene.add(mapGroup);
		this.createBar();
	}

	/** 全国底图：单色面 + 边线，只作背景，不参与交互 */
	private createChina() {
		const params = {
			chinaBgMaterialColor: "#152c47",
			lineColor: "#3f82cd",
		};
		const chinaData = this._assets?.instance.getResource("china") as string;
		if (!chinaData) {
			throw new Error("chinaData is not found");
		}
		const chinaBgMaterial = new MeshLambertMaterial({
			color: new Color(params.chinaBgMaterialColor),
			transparent: true,
			opacity: 1,
		});
		const china = new BaseMap(undefined, {
			//position: new Vector3(0, 0, -0.03),
			data: chinaData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			merge: true,
			material: chinaBgMaterial,
			renderOrder: 2,
		});
		const chinaTopLineMaterial = new LineBasicMaterial({
			color: params.lineColor,
		});
		// renderOrder 与 z 位移配合：面 2 → 边线 3，保证线永远压在面上方
		const chinaTopLine = new Line(undefined, {
			// position: new Vector3(0, 0, -0.02),
			data: chinaData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			material: chinaTopLineMaterial,
			renderOrder: 3,
		});
		// 0.01 的抬升用于规避与底面的 z-fighting，不改变投影平面
		chinaTopLine.lineGroup.position.z += 0.01;
		return { china, chinaTopLine };
	}

	/**
	 * 重庆市主体：拉伸体（ExtrudeMap）+ 顶面（BaseMap）+ 白色描边（Line）。
	 * 顶面抬高到 depth + 0.22，正好盖住拉伸体上沿；三者都加入 focusMapGroup 统一入场。
	 */
	private createProvince() {
		const mapJsonData = this._assets?.instance.getResource("mapJson") as string;
		if (!mapJsonData) {
			throw new Error("chinaData is not found");
		}
		// 顶面 / 侧面材质由 shared/map 的工厂统一生成，横向按 MAP_WIDTH 归一化后做渐变
		const [topMaterial, sideMaterial] = this.createProvinceMaterial();
		this._focusMapTopMaterial = topMaterial;
		this._focusMapSideMaterial = sideMaterial;
		const map = new ExtrudeMap(
			{ assets: this._assets as Assets, time: this.time },
			{
				geoProjectionCenter: this._geoProjectionCenter,
				geoProjectionScale: this._geoProjectionScale,
				position: new Vector3(0, 0, 0.11),
				data: mapJsonData,
				depth: this._depth,
				topFaceMaterial: topMaterial,
				sideMaterial: sideMaterial,
				renderOrder: 9,
			},
		);
		const faceMaterial = new MeshStandardMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5,
			// fog: false,
		});
		/** const faceGradientShader = */ new GradientShader(faceMaterial, {
			// uColor1: 0x2a6e92,
			// uColor2: 0x102736,
			uColor1: 0x12bbe0,
			uColor2: 0x0094b5,
		});
		this._defaultMaterial = faceMaterial;
		// 高亮材质从默认材质克隆，只改颜色与不透明度，避免悬停时影响其他区县
		this._defaultLightMaterial = this._defaultMaterial.clone();
		this._defaultLightMaterial.color = new Color("rgba(115,208,255,1)");
		this._defaultLightMaterial.opacity = 0.8;
		// this.defaultLightMaterial.emissive.setHex(new Color("rgba(115,208,255,1)"));
		// this.defaultLightMaterial.emissiveIntensity = 3.5;
		const mapTop = new BaseMap(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			position: new Vector3(0, 0, this._depth + 0.22),
			data: mapJsonData,
			material: faceMaterial,
			renderOrder: 2,
		});
		// 顶面按区县分成多个 group，每组的子 mesh 才是真正可拾取的面；
		// 事件里统一用 parent（即区县 group）做整体换色，所以这里只收集 mesh
		mapTop.mapGroup.children.forEach((group) => {
			group.children.forEach((mesh) => {
				if (mesh.type === "Mesh") {
					this._eventElement.push(mesh);
				}
			});
		});
		// 描边初始透明，等入场时间轴补到 1；fog: false 避免远端线条被雾冲淡
		this._mapLineMaterial = new LineBasicMaterial({
			color: 0xffffff,
			opacity: 0,
			transparent: true,
			fog: false,
		});
		const mapLine = new Line(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			data: mapJsonData,
			material: this._mapLineMaterial,
			renderOrder: 3,
		});
		// 边线抬到顶面上方 0.01（depth + 0.22 再 +0.01），防止与面共面时闪烁
		mapLine.lineGroup.position.z += this._depth + 0.23;
		return {
			map,
			mapTop,
			mapLine,
		};
	}

	/** 顶面 / 侧面材质：交给 shared/map 的工厂，横向跨度用 MAP_WIDTH 归一化渐变 */
	private createProvinceMaterial() {
		return createMapMaterials(this._assets, this.time, String(MAP_WIDTH));
	}

	/**
	 * 指标柱按区域分散选取。
	 * 柱标签约 156px 宽，中心城区几个区的地理间距过小，
	 * 若直接取前 7 名会让标签互相叠压，因此改为挑选方位互不重叠的区县。
	 *
	 * 这批点覆盖东北（万州）、最北（城口）、最东（巫山）、中部（涪陵）、
	 * 西南（江津）、西北（合川）、东南（黔江），保证光柱在画面上分布均匀。
	 * 返回结果按 value 降序，createBar 依赖首项作为高度归一化基准。
	 */
	private getBarRegions() {
		const regionNames = [
			"万州区",
			"城口县",
			"巫山县",
			"涪陵区",
			"江津区",
			"合川区",
			"黔江区",
		];
		return sortByValue(
			provincesData.filter((item) => regionNames.includes(item.name)),
		);
	}

	/**
	 * 创建指标光柱：柱体 + 渐变着色 + 底部光环 + 顶部数值标签。
	 * 每个区县一根，柱高按 value / 最大值 归一化，最高 2.8 世界单位。
	 */
	private createBar() {
		const data = this.getBarRegions();
		const barGroup = new Group();
		this._barGroup = barGroup;
		// 0.7 是整体尺寸系数，同时作用于柱体截面与最大高度，便于一处调整视觉量级
		const factor = 0.7;
		const height = 4.0 * factor;
		// data 已按 value 降序，首项即最大值，作为归一化分母
		const max = data[0].value;
		this._allBar = [];
		this._allBarMaterial = [];
		this._allGuangquan = [];
		this._allProvinceLabel = [];
		data.forEach((item, index) => {
			const geoHeight = height * (item.value / max);
			const material = new MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				depthTest: false,
				fog: false,
			});
			// 渐变尺寸用柱子自身高度，保证高度变化时颜色分布不拉伸；
			// 后 3 根（index 4~6）换成暖色，与前 4 根形成冷 / 暖两组视觉区分
			new GradientShader(material, {
				uColor1: index > 3 ? 0xfbdf88 : 0x50bbfe,
				uColor2: index > 3 ? 0xfffef4 : 0x77fbf5,
				size: geoHeight,
				dir: "y",
			});
			const geo = new BoxGeometry(0.1 * factor, 0.1 * factor, geoHeight);
			// 几何体原点默认在柱体中心，上移半高让原点落在柱底，
			// 这样入场时 z 轴缩放才是「从地面长出来」而不是向两端膨胀
			geo.translate(0, 0, geoHeight / 2);
			const mesh = new Mesh(geo, material);
			mesh.renderOrder = 5;
			const areaBar = mesh;
			// 投影结果的 y 轴向下，Three.js 的 y 轴向上，故取负号翻正
			const [x, y] = this.geoProjection(item.centroid as [number, number]);
			areaBar.position.set(x, -y, this._depth + 0.45);
			areaBar.scale.set(1, 1, 0);
			areaBar.userData = { ...item };
			// 光环面片自身绕 X 轴 -90° 放平，因此位置用世界坐标 (x, 高度, z)：
			// 高度取 0.44，略低于柱底 0.45，避免与柱体根部穿插露边
			const guangQuan = this.createQuan(
				new Vector3(x, this._depth + 0.44, y),
				index,
			);
			const hg = this.createHUIGUANG(
				geoHeight,
				index > 3 ? 0xfffef4 : 0x77fbf5,
			);
			areaBar.add(...hg);
			barGroup.add(areaBar);
			// 整组放平后，柱体的局部 z 轴才对应世界坐标的竖直方向
			barGroup.rotation.x = -Math.PI / 2;
			// 标签 z 取 depth + 1.1 + 柱高，相对柱底（depth + 0.45）高 0.65，
			// 并随柱高一起抬升，始终悬在光柱顶端上方而不是被柱体穿过
			const barLabel = createBarLabel(
				{
					label3d: this._label3d,
					labelGroup: this._labelGroup,
					project: (point) => this.geoProjection(point),
				},
				{
					data: item,
					index,
					position: new Vector3(x, -y, this._depth + 1.1 + geoHeight),
					unit: "万人",
				},
			);
			this._allBar.push(areaBar);
			this._allBarMaterial.push(material);
			this._allGuangquan.push(guangQuan);
			this._allProvinceLabel.push(barLabel);
		});
		this.scene.add(barGroup);
	}

	/**
	 * 注册区县拾取事件：悬停整块换高亮材质、移出换回、点击打印区县名。
	 * objectsHover 只做进出记录（进入去重入栈、移出按 name 过滤）；
	 * 还原动作无条件执行，"保留栈顶高亮"的分支已被注释成无效语句，不参与判断。
	 */
	private createEvent() {
		let objectsHover: Object3D[] = [];
		const reset = (mesh: Object3D) => {
			mesh.traverse((obj) => {
				if ("isMesh" in obj && obj.isMesh) {
					(obj as Mesh).material = this
						._defaultMaterial as MeshStandardMaterial;
				}
			});
		};
		const move = (mesh: Object3D) => {
			mesh.traverse((obj) => {
				if ("isMesh" in obj && obj.isMesh) {
					(obj as Mesh).material = this
						._defaultLightMaterial as MeshStandardMaterial;
				}
			});
		};
		this._eventElement.forEach((mesh) => {
			this._interactionManager.add(mesh);
			mesh.addEventListener("mousedown" as keyof Object3DEventMap, (ev) => {
				console.log(ev.target.userData.name);
			});
			mesh.addEventListener("mouseover" as keyof Object3DEventMap, (event) => {
				if (!objectsHover.includes(event.target.parent as Object3D)) {
					objectsHover.push(event.target.parent as Object3D);
				}
				document.body.style.cursor = "pointer";
				move(event.target.parent as Object3D);
			});
			mesh.addEventListener("mouseout" as keyof Object3DEventMap, (event) => {
				objectsHover = objectsHover.filter(
					(n) =>
						n.userData.name !== (event.target.parent as Object3D).userData.name,
				);
				if (objectsHover.length > 0) {
					/** const mesh = **/ objectsHover[objectsHover.length - 1];
				}
				reset(event.target.parent as Object3D);
				document.body.style.cursor = "default";
			});
		});
	}

	private createHUIGUANG(h: number, color: number) {
		// 光晕高度与柱体一致，颜色跟随柱体分组，保证冷暖两组的辉光不串色
		return createGlowPillar(this._assets, h, color);
	}

	/**
	 * 柱底光环：两层贴图面片叠在一起，每帧在面片平面内旋转，形成扫描感。
	 * tick 订阅没有显式注销，随场景一起销毁，故不需要单独保存句柄。
	 */
	private createQuan(position: Vector3Like, _index: number) {
		const { group, rotatingMesh } = createBarHalo(this._assets, position);
		this._quanGroup = group;
		this.scene.add(group);
		this.time.on("tick", () => {
			// 0.05 弧度 / 帧约等于 3°/帧，60fps 下转一圈约 2 秒
			rotatingMesh.rotation.z += 0.05;
		});
		return group;
	}

	/**
	 * 地图扩散光：以投影中心为圆心的呼吸光斑，叠在底图与主体之间，
	 * 让平板地图有「向外扩散」的动态底座。
	 */

	private createDiffuse() {
		createMapDiffuse({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/** 扩散网格：地面上的经纬网格，随相机俯视产生纵深感 */
	private createGrid() {
		createMapGrid({ scene: this.scene, time: this.time, assets: this._assets });
	}

	/** 创建底部高亮：最底层的径向渐变光晕，负责把地图从纯黑背景里「托」起来 */
	private createBottomBg() {
		createMapOcean({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/** 模糊边线：全国底图外侧的柔光描边，弱化边界硬边，营造发光地图质感 */
	private createChinaBlurLine() {
		createMapBlurLine({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/**
	 * 创建静态标签：全国行政区名（按 chinaData 的 hide / blur 裁剪）、重庆中心主标签、
	 * 两个装饰图标。返回值包含主标签在内的全部标签，入场时统一错峰淡入。
	 */
	private createLabel() {
		this._otherLabel = createMapLabels(
			{
				label3d: this._label3d,
				labelGroup: this._labelGroup,
				project: (point) => this.geoProjection(point),
			},
			chinaData,
			this._mapFocusLabelInfo,
			[
				{
					icon: labelIcon,
					// 东北方向的大号图标，reflect 打开后沿 y 轴镜像出倒影
					center: [111.6, 30.6],
					width: "40px",
					height: "40px",
					reflect: true,
				},
				{
					icon: labelIcon,
					// 西南方向的小号图标，不做倒影，避免与周边区县标签重叠
					center: [105.1, 28.4],
					width: "20px",
					height: "20px",
					reflect: false,
				},
			],
		);
	}

	/** 旋转圆环：两层同心装饰环，初始缩到 0，由入场时间轴依次放大并持续自转 */
	private createRotateBorder() {
		[this._rotateBorder1, this._rotateBorder2] = createRotationBorders({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/**
	 * 创建飞线：从渝中区向光柱所在的 7 个区县重心发散的流光管。
	 * 初始整组隐藏，等重庆主体放大完成后才显示，避免开场时线先于地图出现。
	 */
	private createFlyLine() {
		this._flyLineGroup = new Group();
		this._flyLineGroup.visible = false;
		this.scene.add(this._flyLineGroup);
		populateMapFlyLines(
			{
				assets: this._assets,
				group: this._flyLineGroup,
				project: (point) => this.geoProjection(point),
				depth: this._depth,
			},
			this.time,
			this._flyLineCenter,
			// 终点与光柱保持一致，改 getBarRegions 时飞线会自动跟随
			() => this.getBarRegions(),
		);
	}

	/** 飞线焦点：落在汇聚点上的同心光圈，随组可见性在入场尾段亮起 */
	private createFocus() {
		const focusObj = new Focus(
			{ assets: this._assets as Assets },
			// 内外圈统一用同一个浅青色，靠贴图与透明度区分层次，与地图冷色调保持一致
			{ color1: 0xbdfdfd, color2: 0xbdfdfd },
		);
		const [x, y] = this.geoProjection(this._flyLineCenter);
		// 与柱底同高（depth + 0.44），保证光圈贴在地图顶面之上而不是陷进去
		focusObj.position.set(x, -y, this._depth + 0.44);
		focusObj.scale.set(1, 1, 1);
		this._flyLineFocusGroup.add(focusObj);
	}

	/**
	 * 创建上升粒子：10 个点铺在 30 单位范围内向上漂浮，
	 * 用加法混合模拟空气中的光尘，只作氛围，不承载业务数据。
	 */
	private createParticles() {
		this._particles = new Particles(
			{ time: this.time },
			{
				num: 10,
				range: 30,
				dir: "up",
				speed: 0.05,
				// 加法混合 + 关闭深度写入：粒子互相叠加变亮，且不会遮挡后面的光柱与标签
				material: new PointsMaterial({
					map: Particles.createTexture(),
					size: 1,
					color: 0x00eeee,
					transparent: true,
					opacity: 1,
					depthTest: false,
					depthWrite: false,
					vertexColors: true,
					blending: AdditiveBlending,
					sizeAttenuation: true,
				}),
			},
		);
		this._particleGroup = new Group();
		this.scene.add(this._particleGroup);
		this._particleGroup.rotation.x = -Math.PI / 2;
		this._particles.setParent(this._particleGroup);
		this._particles.enable = true;
		this._particleGroup.visible = true;
	}

	/** 创建散点图：24 个业务点位按 value 降序后交给通用散点工厂，初始隐藏等入场 */
	private createScatter() {
		this._scatterGroup = new Group();
		this._scatterGroup.visible = false;
		this._scatterGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._scatterGroup);
		populateMapScatter(
			{
				assets: this._assets,
				group: this._scatterGroup,
				project: (point) => this.geoProjection(point),
				depth: this._depth,
			},
			() => sortByValue(scatterData),
		);
	}

	/**
	 * 创建监测点：贴图 sprite + PM2.5 数值标签。
	 * 点击某个点后只显示它的标签，并启动 3 秒一次的轮播；未点击时常驻轮播由时间轴尾段触发。
	 */
	private createInfoPoint() {
		this._infoPointGroup = new Group();
		this.scene.add(this._infoPointGroup);
		this._infoPointGroup.visible = false;
		this._infoPointGroup.rotation.x = -Math.PI / 2;
		this._infoPointIndex = 0;
		this._infoPointLabelTime = null;
		this._infoLabelElement = [];
		const label3d = this._label3d;
		const texture = this._assets?.instance.getResource("point") as Texture;
		if (!texture) {
			throw new Error("point texture not found");
		}
		const colors = [0xfffef4, 0x77fbf5];
		// 降序后首项为最大值，用来把 sprite 尺寸映射到 0.7~1.1 之间
		const infoAllData = sortByValue(infoData);
		const max = infoAllData[0].value;
		infoAllData.forEach((data, index) => {
			const material = new SpriteMaterial({
				map: texture,
				// 两个颜色交替，避免同色点在地图上难以分辨
				color: colors[index % colors.length],
				fog: false,
				transparent: true,
				depthTest: false,
			});
			const sprite = new Sprite(material);
			// 23 高于轮廓流光的 22，保证监测点始终浮在最上层
			sprite.renderOrder = 23;
			const scale = 0.7 + (data.value / max) * 0.4;
			sprite.scale.set(scale, scale, scale);
			const [x, y] = this.geoProjection([data.lng, data.lat]);
			const position = [x, -y, this._depth + 0.7];
			sprite.position.set(position[0], position[1], position[2]);
			sprite.userData.position = [...position];
			// index 供点击时定位到对应标签，其余字段备查
			sprite.userData = {
				position: [x, -y, this._depth + 0.7],
				name: data.name,
				value: data.value,
				level: data.level,
				index: index,
			};
			this._infoPointGroup?.add(sprite);
			const label = createMonitoringLabel(
				{
					label3d,
					labelGroup: this._infoPointGroup as Group,
					project: (point) => this.geoProjection(point),
				},
				data,
				{
					depth: this._depth,
					// 1.9 的竖直偏移让标签浮在 sprite 上方约 1.2 单位，不遮住点位
					verticalOffset: 1.9,
					valueLabel: "PM2.5",
					valueUnit: "ug/m²",
				},
			);
			this._infoLabelElement.push(label);
			this._interactionManager.add(sprite);
			sprite.addEventListener("mousedown" as keyof Object3DEventMap, (ev) => {
				// _clicked 挡住 mousedown 的重复触发；组不可见时（入场前）不响应
				if (this._clicked || !this._infoPointGroup?.visible) return false;
				this._clicked = true;
				this._infoPointIndex = ev.target.userData.index;
				this._infoLabelElement.forEach((label) => {
					label.visible = false;
				});
				label.visible = true;
				this.createInfoPointLabelLoop();
			});
			sprite.addEventListener("mouseup" as keyof Object3DEventMap, () => {
				this._clicked = false;
			});
			sprite.addEventListener("mouseover" as keyof Object3DEventMap, () => {
				document.body.style.cursor = "pointer";
			});
			sprite.addEventListener("mouseout" as keyof Object3DEventMap, () => {
				document.body.style.cursor = "default";
			});
		});
	}

	/**
	 * 启动监测点标签轮播：每 3 秒把可见标签切到下一个，循环播放。
	 * 先 clearInterval 再重建，避免连续点击时堆叠多个定时器导致切换越来越快。
	 */
	private createInfoPointLabelLoop() {
		clearInterval(this._infoPointLabelTime as number);
		this._infoPointLabelTime = setInterval(() => {
			this._infoPointIndex++;
			if (this._infoPointIndex >= this._infoLabelElement.length) {
				this._infoPointIndex = 0;
			}
			this._infoLabelElement.forEach((label, i) => {
				if (this._infoPointIndex === i) {
					label.visible = true;
				} else {
					label.visible = false;
				}
			});
		}, 3000);
	}

	/**
	 * 轮廓流光：沿重庆市外轮廓生成一条管状线（type: "Line3"），
	 * 用 pathLine3 贴图做 alphaMap，每帧平移 offset.x 形成沿边界奔跑的光带。
	 * 挂在 focusMapGroup 下，随主体一起做入场缩放。
	 */
	private createStorke() {
		const mapStroke = this._assets?.instance.getResource("mapStroke") as string;
		const texture = this._assets?.instance.getResource("pathLine3") as Texture;
		if (!mapStroke || !texture) {
			throw new Error("mapStroke or pathLine3 texture not found");
		}
		// 横向重复 2 次让光带更密；RepeatWrapping 是 offset 循环滚动的前提
		texture.wrapS = texture.wrapT = RepeatWrapping;
		texture.repeat.set(2, 1);
		const pathLine = new Line(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			// 比顶面高 0.02，压住顶面又低于标签，避免被地形遮住
			position: new Vector3(0, 0, this._depth + 0.24),
			data: mapStroke,
			material: new MeshBasicMaterial({
				color: 0x2bc4dc,
				map: texture,
				alphaMap: texture,
				fog: false,
				transparent: true,
				opacity: 1,
				blending: AdditiveBlending,
			}),
			type: "Line3",
			renderOrder: 22,
			// 管半径 0.03：细到不抢地形、粗到缩小时仍可见
			tubeRadius: 0.03,
		});
		// 设置父级：跟随 focusMapGroup 的入场缩放，不会与地图错位
		this._focusMapGroup?.add(pathLine.lineGroup);
		this.time.on("tick", () => {
			// 每帧偏移 0.005（60fps 下约 0.3 / 秒），配合重复贴图形成持续流动感；
			// 速度再快会显得闪烁，再慢则看不出光带在跑
			texture.offset.x += 0.005;
		});
	}

	/**
	 * 创建入场时间轴（创建后 pause，等 Map3D 调 play）。
	 *
	 * 时间轴用三个 label 分段，段内并行补间、段间按顺序推进：
	 * - 0s 起（无 label）：镜头用 2s 从侧上方移到接近正俯视的位置；
	 * - focusMap（1.5s 起）：重庆主体从压扁状态归位并放大到 1，
	 *   onComplete 时统一打开飞线 / 散点 / 监测点三层，并启动标签轮播；
	 * - focusMapOpacity（2s 起）：顶面与侧面淡入、行政区标签错峰上浮、
	 *   白色描边淡入、两层旋转圆环放大；
	 * - bar（3s 起）：7 根光柱依次升起、材质淡入、数值标签上浮并做数字滚动、底部光环展开。
	 * 最后一根圆环补完时触发 onPlayComplete，把控制权交回 Map3D 播 UI 入场。
	 */
	private createAnimationTimeline() {
		// this.time.on("tick", () => {
		//     console.log(this.camera.instance.position);
		// });
		const tl = gsap.timeline({
			onComplete: () => {},
		});
		tl.pause();
		this._animateTl = tl;
		// 段起点错开 0.5s / 1s，让「镜头→主体→光柱」有先后节奏而不是一起动
		tl.addLabel("focusMap", 1.5);
		tl.addLabel("focusMapOpacity", 2);
		tl.addLabel("bar", 3);
		// 第一段：镜头从侧上方移到接近正俯视的位置，circ.out 让起步快、收尾缓
		tl.to(this.camera.instance.position, {
			duration: 2,
			x: -0.17427287762525134,
			y: 13.678992786206543,
			z: 20.688611202093714,
			ease: "circ.out",
			onStart: () => {
				// 开场先收掉汇聚点光圈，等飞线出现后再亮，避免孤立的光圈悬在空中
				this._flyLineFocusGroup.visible = false;
			},
		});
		tl.to(
			(this._focusMapGroup as Group).position,
			{
				duration: 1,
				x: 0,
				y: 0,
				z: 0,
			},
			"focusMap",
		);

		tl.to(
			(this._focusMapGroup as Group).scale,
			{
				duration: 1,
				x: 1,
				y: 1,
				z: 1,
				ease: "circ.out",
				onComplete: () => {
					// 主体「长成」之后才放出业务图层，保证它们的位置与最终地形一致
					(this._flyLineGroup as Group).visible = true;
					(this._scatterGroup as Group).visible = true;
					(this._infoPointGroup as Group).visible = true;
					this.createInfoPointLabelLoop();
				},
			},
			"focusMap",
		);

		// 顶面与侧面从 opacity 0 淡入到 1，让主体像被「点亮」而不是瞬间出现
		tl.to(
			this._focusMapTopMaterial,
			{
				duration: 1,
				opacity: 1,
				ease: "circ.out",
			},
			"focusMapOpacity",
		);
		tl.to(
			this._focusMapSideMaterial,
			{
				duration: 1,
				opacity: 1,
				ease: "circ.out",
				onComplete: () => {
					// 淡入结束后关掉 transparent，让侧面参与深度写入，避免与光柱穿插时排序错误
					(
						this._focusMapSideMaterial as NonNullable<
							typeof this._focusMapSideMaterial
						>
					).transparent = false;
				},
			},
			"focusMapOpacity",
		);
		this._otherLabel.forEach((item, index) => {
			const element = item.element.querySelector("#other-label");
			tl.to(
				element,
				{
					duration: 1,
					// 按数组顺序每个标签错峰 0.1s 上浮，避免所有地名同时弹出显得杂乱
					delay: 0.1 * index,
					translateY: 0,
					opacity: 1,
					ease: "circ.out",
				},
				"focusMapOpacity",
			);
		});
		// 描边等主体淡入完成后再慢半拍出现，避免与面同时出现显得生硬
		tl.to(
			this._mapLineMaterial,
			{
				duration: 0.5,
				delay: 0.3,
				opacity: 1,
			},
			"focusMapOpacity",
		);
		tl.to(
			(this._rotateBorder1 as NonNullable<typeof this._rotateBorder1>).scale,
			{
				delay: 0.3,
				duration: 1,
				x: 1,
				y: 1,
				z: 1,
				ease: "circ.out",
			},
			"focusMapOpacity",
		);
		// 第二层圆环再晚 0.2s 展开，并在补完后亮起飞线焦点、
		// 调用 onPlayComplete 让 Map3D 接着播 UI 入场
		tl.to(
			(this._rotateBorder2 as NonNullable<typeof this._rotateBorder2>).scale,
			{
				duration: 1,
				delay: 0.5,
				x: 1,
				y: 1,
				z: 1,
				ease: "circ.out",
				onComplete: () => {
					this._flyLineFocusGroup.visible = true;
					this._onPlayComplete?.();
				},
			},
			"focusMapOpacity",
		);
		// 光柱升起：几何体原点已在柱底，z 轴 scale 从 0 补到 1 就是「从地面长出」
		this._allBar.forEach((item, index) => {
			tl.to(
				item.scale,
				{
					duration: 1,
					delay: 0.1 * index,
					x: 1,
					y: 1,
					z: 1,
					ease: "circ.out",
				},
				"bar",
			);
		});
		// 材质与几何同步淡入，按 index 错峰，形成逐根点亮的节奏
		this._allBarMaterial.forEach((item, index) => {
			tl.to(
				item,
				{
					duration: 1,
					delay: 0.1 * index,
					opacity: 1,
					ease: "circ.out",
				},
				"bar",
			);
		});

		this._allProvinceLabel.forEach((item, index) => {
			const element = item.element.querySelector("#provinces-label-wrap");
			const number = item.element.querySelector(
				"#number #value",
			) as HTMLDivElement;
			// 先从 DOM 里读出真实数值，再用一个代理对象从 0 补间过去，
			// 这样数字滚动与标签上浮共用同一条时间轴、同一套错峰节奏
			const numberVal = Number(number.innerText);
			const numberAnimate = {
				score: 0,
			};
			tl.to(
				element,
				{
					duration: 1,
					delay: 0.2 * index,
					translateY: 0,
					opacity: 1,
					ease: "circ.out",
				},
				"bar",
			);
			tl.to(
				numberAnimate,
				{
					duration: 1,
					delay: 0.2 * index,
					score: numberVal,
					onUpdate: showScore,
				},
				"bar",
			);
			function showScore() {
				number.innerText = numberAnimate.score.toFixed(0);
			}
		});
		this._allGuangquan.forEach((item, index) => {
			// children[0] / children[1] 是 createBarHalo 返回的两层面片，
			// 两者同速放大；index 错峰让光环跟着对应光柱一起绽放
			tl.to(
				item.children[0].scale,
				{
					duration: 1,
					delay: 0.1 * index,
					x: 1,
					y: 1,
					z: 1,
					ease: "circ.out",
				},
				"bar",
			);
			tl.to(
				item.children[1].scale,
				{
					duration: 1,
					delay: 0.1 * index,
					x: 1,
					y: 1,
					z: 1,
					ease: "circ.out",
				},
				"bar",
			);
		});
	}

	/**
	 * 经纬度 → 地图平面坐标。
	 * 固定用墨卡托投影，center 平移使投影中心落在原点，scale 为 165（像素 / 弧度），
	 * translate 归零后返回值的单位就是世界坐标。投影结果 y 轴朝下，
	 * 所以挂到旋转父组的点要写 `-y` 才能与 Three.js 的向上 y 轴对齐；
	 * 个别直接按世界坐标摆放的调用点（如光环）会显式传入高度 y，不在此列。
	 * @param args [经度, 纬度]
	 */
	private geoProjection(args: [number, number]) {
		return geoMercator()
			.center(this._geoProjectionCenter)
			.scale(this._geoProjectionScale)
			.translate([0, 0])(args) as [number, number];
	}

	/** 每帧回调：先让父类推进渲染与相机，再刷新交互拾取，悬停才跟得上快速移动 */
	update() {
		super.update();
		this._interactionManager?.update();
	}

	/**
	 * 销毁场景。清理顺序按「先停主动更新、再释放外部资源、最后交给父类」：
	 * 1. 清监测点轮播定时器，否则 3 秒后仍会操作已移除的标签；
	 * 2. kill 入场时间轴，防止补间继续改已销毁对象的属性；
	 * 3. dispose 交互管理器，注销 canvas 上的鼠标监听；
	 * 4. 销毁 Label3D 的 CSS3D 渲染器与其 DOM；
	 * 5. 复位光标（悬停时被改成 pointer，切屏后会残留）；
	 * 6. super.destroy 释放 WebGL 渲染器、相机、时钟等公共资源。
	 */
	destroy() {
		if (this._infoPointLabelTime) {
			clearInterval(this._infoPointLabelTime);
			this._infoPointLabelTime = null;
		}
		this._animateTl?.kill();
		this._interactionManager.dispose();
		this._label3d.destroy();
		document.body.style.cursor = "default";
		super.destroy();
	}
}

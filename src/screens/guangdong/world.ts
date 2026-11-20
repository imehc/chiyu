/**
 * 广东省 3D 场景编排：投影参数、地图分层、光柱、飞线、散点、监测点与入场时间轴。
 * 继承 shared/map 的 WorldCore（相机 / 渲染器 / 时钟），由 Map3D 在资源加载完成后实例化，
 * 每帧调用 update；所有几何共用同一套墨卡托投影（geoProjection），保证与 GeoJSON 边界对齐。
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

/** 经纬度点，顺序固定为 [经度, 纬度]，东经 / 北纬为正 */
export type Point = [number, number];

/**
 * 地图中心主标签：中文名、英文名与标题锚点（非投影中心）。
 * 锚点取 [113.28, 20.625]，在珠江口以南海域（比版图重心偏南），
 * 避免压住珠三角的光柱、飞线与监测点。
 */
const defaultMapFocusLabelInfo: WorldMapFocusLabelInfo = {
	// name: "中国",
	// enName: "China",
	// center: [116.397428, 39.90923],
	name: "广东省",
	enName: "GUANGDONG PROVINCE",
	center: [113.280637, 20.625178],
};

/**
 * 广东省地图场景。
 *
 * 构图顺序：背景（渐变遮罩、全国模糊边线、网格、旋转圆环）→ 全国底图 → 广东拉伸体 →
 * 光柱与光晕 → 飞线与汇聚焦点 → 粒子 / 散点 / 监测点 → 轮廓流光 → 入场时间轴。
 * BaseMap / ExtrudeMap 先在 XY 平面按墨卡托投影绘制，再整体绕 X 轴旋转 -90° 摊平，
 * 因此几何的局部 z 轴对应世界坐标的竖直方向；图层叠放靠 position.z 与 renderOrder，
 * 叠加类元素（光柱、飞线、散点）普遍启用 depthTest: false，避免被地块按深度提前遮住。
 */
export default class World extends WorldCore {
	/** 资源句柄，用于取 GeoJSON 与贴图；构造时可能为空，取资源前需判空 */
	private readonly _assets?: Assets;
	/** three.interactive 的射线拾取管理器，注册事件元素并在 update 中逐帧检测 */
	private readonly _interactionManager: InteractionManager;

	/**
	 * 墨卡托投影中心 [经度, 纬度]，取广州中心点。
	 * 投影结果以该点为世界原点，广东全境大致以原点为对称中心展开，
	 * 这样镜头、旋转圆环、光环都只需围绕 (0,0) 布置。
	 */
	private _geoProjectionCenter: Point;
	/**
	 * 投影缩放（世界单位 / 弧度），取 120。
	 * 广东经度跨度约 7.6°（≈0.133 弧度），120 × 0.133 ≈ 16 世界单位，
	 * 配合当前机位恰好填满画面中部，四周留出飞线与装饰圆环的空间；
	 * 调整该值必须同步 createProvinceMaterial 里传给 shader 的横向跨度 15.78。
	 */
	private _geoProjectionScale: number;
	/**
	 * 飞线汇聚点 [经度, 纬度]，取广州市辖区重心（与 regions.ts 中广州市 centroid 一致）。
	 * 用重心而非驻地 center，使汇聚点落在珠三角几何中心，飞线向四周更均匀。
	 */
	private _flyLineCenter: Point;
	/** 地图拉伸体厚度（世界单位），同时是柱体、标签、轮廓等贴地元素的 z 基准 */
	private _depth: number;
	/** 中心主标签的文案与锚点，默认广东省；后续换屏时整体替换即可 */
	private _mapFocusLabelInfo: WorldMapFocusLabelInfo;
	/** 监测点按下标记，避免一次点击在 mousedown 与 mouseup 之间重复启动轮播 */
	private _clicked: boolean;

	/** CSS3D 标签挂载组，绕 X 轴放平以贴合地图平面 */
	private _labelGroup!: Group;
	/** 标签渲染器，负责把 DOM 投影到 3D 位置，destroy 时必须显式销毁 */
	private _label3d!: Label3D;
	/** 飞线汇聚点的光圈组，入场尾段才显示 */
	private _flyLineFocusGroup!: Group;

	/** 参与射线拾取的区县顶面 mesh，来自 mapTop 的子节点 */
	private _eventElement!: Object3D[];
	/** 区县默认材质，hover 结束后回填 */
	private _defaultMaterial: MeshStandardMaterial | null = null;
	/** 区县高亮材质，hover 时替换；是默认材质的克隆，避免污染未悬停的区域 */
	private _defaultLightMaterial: MeshStandardMaterial | null = null;

	/** 两层旋转装饰圆环，入场时从 0 缩放到 1 */
	private _rotateBorder1: Mesh | null = null;
	private _rotateBorder2: Mesh | null = null;
	/** 广东主体分组：拉伸体、顶面、边线、轮廓流光都挂在这里，入场时整体放大 */
	private _focusMapGroup: Group | null = null;

	/** 拉伸体顶面材质，入场时把 opacity 从 0 补到 1 */
	private _focusMapTopMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	/** 拉伸体侧面材质，淡入结束后关闭 transparent 以恢复深度写入 */
	private _focusMapSideMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	/** 顶面白色描边材质，初始 opacity 为 0，入场时淡入 */
	private _mapLineMaterial: LineBasicMaterial | null = null;
	/** 光柱根组，绕 X 轴放平后统一挂到场景 */
	private _barGroup: Group | null = null;
	/** 按 value 降序排列的前 7 根光柱，入场补间按索引错峰 */
	private _allBar: Mesh[] = [];
	/** 与 _allBar 一一对应的材质，需同步补间 opacity */
	private _allBarMaterial: MeshBasicMaterial[] = [];
	/** 柱底双层光圈组，与 _allBar 一一对应 */
	private _allGuangquan: Group[] = [];
	/** 柱顶数值标签，入场时做位移 + 数字滚动 */
	private _allProvinceLabel: Label[] = [];
	/** 最近一次创建的光圈组；渲染不依赖它，真正的引用在 _allGuangquan 里，每建一根柱就被覆盖一次 */
	private _quanGroup: Group | null = null;
	/** 全国底图上的装饰标签（省名、图标、主标题），入场时逐个错峰淡入 */
	private _otherLabel: Label[] = [];
	/** 飞线组，初始隐藏，等广东主体展开完成后显示 */
	private _flyLineGroup: Group | null = null;
	/** 上升粒子系统，营造底部光尘 */
	private _particles: Particles | null = null;
	/** 粒子的父组，绕 X 轴放平 */
	private _particleGroup: Group | null = null;
	/** 箭头散点组，初始隐藏 */
	private _scatterGroup: Group | null = null;
	/** 监测点 Sprite 组，初始隐藏 */
	private _infoPointGroup: Group | null = null;
	/** 监测点详情卡，同一时刻只显示一张 */
	private _infoLabelElement: Label[] = [];
	/** 当前轮播到的监测点索引：每 3 秒自增，越界后归零 */
	private _infoPointIndex: number = 0;
	/** 场景主时间轴，play 由 Map3D 触发，destroy 时 kill */
	private _animateTl: gsap.core.Timeline | null = null;
	/** 监测点详情卡轮播定时器，间隔 3 秒，销毁时必须 clear */
	private _infoPointLabelTime: ReturnType<typeof setInterval> | null = null;
	/** 场景播完回调，Map3D 用它接 UI 面板入场动画 */
	private readonly _onPlayComplete?: () => void;

	/**
	 * 初始化相机、雾效、拾取管理器，并按固定顺序搭建场景。
	 * @param canvas 渲染画布，尺寸由父容器决定
	 * @param assets 资源加载器，构造时可能尚未加载完成
	 * @param options.onPlayComplete 入场时间轴结束时触发，转交给 Map3D
	 */
	constructor(
		canvas: HTMLCanvasElement,
		assets?: Assets,
		options: MapWorldOptions = {},
	) {
		super(canvas);
		this._onPlayComplete = options.onPlayComplete;
		// 投影中心取广州，投影后广东全境以世界原点为中心，便于镜头与圆环对位
		this._geoProjectionCenter = [113.280637, 23.125178];
		this._geoProjectionScale = 120;
		this._flyLineCenter = [113.544372, 23.329249];
		this._depth = 0.5;
		this._mapFocusLabelInfo = defaultMapFocusLabelInfo;
		this._clicked = false;
		this.scene.fog = new Fog(0x102736, 1, 50); // 雾
		this.scene.background = new Color(0x102736); // 背景
		// 初始机位拉远并偏到西南侧，先展示全国底图，入场时间轴再推近广东
		this.camera.instance.position.set(
			-13.767695123014105,
			12.990152163077308,
			39.28228164159694,
		); // 相机初始位置
		// near / far 覆盖从贴地元素到全国底图的全部深度，避免远处省界被裁掉
		this.camera.instance.near = 1;
		this.camera.instance.far = 10000;
		this.camera.instance.updateProjectionMatrix();
		this._interactionManager = new InteractionManager(
			this.renderer.instance,
			this.camera.instance,
			canvas,
		); //交互管理
		this._assets = assets;
		this.initEnvironment();
		this.init();
	}

	/** 对外暴露主时间轴，Map3D 的 play 依赖它启动入场动画 */
	get animateTl() {
		return this._animateTl as gsap.core.Timeline;
	}

	/**
	 * 搭建场景。顺序有依赖，不可随意调换：
	 * 背景层与标签组先就位，地图创建时会顺带生成光柱，之后才注册交互、飞线、焦点；
	 * 散点 / 监测点依赖地图建好后的坐标，轮廓流光要挂在 _focusMapGroup 下；
	 * 最后统一生成入场时间轴，此时所有待补间的对象都已存在。
	 */
	private init() {
		// 标签组统一绕 X 轴 -90° 放平，标签局部坐标系因此与地图平面一致
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
		// 飞线汇聚点的光圈组：先隐藏，入场尾段与飞线同时出现
		this._flyLineFocusGroup = new Group();
		this._flyLineFocusGroup.visible = false;
		this._flyLineFocusGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._flyLineFocusGroup);
		// 区县顶面 mesh 收集到这里，createEvent 时统一注册射线拾取
		this._eventElement = [];
		// hover 时在默认 / 高亮两套材质间切换，移出后回填默认材质
		this._defaultMaterial = null; // 默认材质
		this._defaultLightMaterial = null; // 高亮材质

		// 背景与装饰先铺底，保证后续地图的 renderOrder 有正确的比较基准
		this.createBottomBg();
		this.createChinaBlurLine();
		this.createGrid();
		this.createRotateBorder();
		this.createLabel();
		// createMap 内部会顺带调用 createBar，光柱数据在此刻就已排序并落位
		this.createMap();
		this.createEvent();
		this.createFlyLine();
		this.createFocus();
		this.createParticles();
		this.createScatter();
		this.createInfoPoint();
		this.createStorke();
		this.createAnimationTimeline();
	}

	/** 环境光与方向光由工厂统一挂到场景，拉伸体的 Lambert / Standard 材质依赖它们才有明暗 */
	private initEnvironment() {
		createMapEnvironment(this.scene);
	}

	/**
	 * 组装两层地图：全国底图作为背景，广东拉伸体作为主体。
	 * 广东单独放进 focusMapGroup，初始 z 缩放为 0（压扁不可见），
	 * 等时间轴把它拉开，形成「从全国图上浮起」的入场效果。
	 */
	private createMap() {
		const mapGroup = new Group();
		const focusMapGroup = new Group();
		this._focusMapGroup = focusMapGroup;
		const { china, chinaTopLine } = this.createChina();
		const { map, mapTop, mapLine } = this.createProvince();
		china.setParent(mapGroup);
		chinaTopLine.setParent(mapGroup);
		// 创建扩散
		this.createDiffuse();
		map.setParent(focusMapGroup);
		mapTop.setParent(focusMapGroup);
		mapLine.setParent(focusMapGroup);
		// -0.01 让广东整体略低于全国底图，避免同一高度上出现 z-fighting
		focusMapGroup.position.set(0, 0, -0.01);
		// z 轴缩放为 0 是压扁初始态，时间轴里补回 1 产生立体生长感
		focusMapGroup.scale.set(1, 1, 0);
		mapGroup.add(focusMapGroup);
		// 地图在 XY 平面绘制，绕 X 轴 -90° 后摊平到 XZ 水平面，局部 z 变成世界高度
		mapGroup.rotation.x = -Math.PI / 2;
		// 整体抬高 0.2，与 y = -0.7 的底部光海拉开距离，避免地块贴在海面贴图上
		mapGroup.position.set(0, 0.2, 0);
		this.scene.add(mapGroup);
		this.createBar();
	}

	/**
	 * 全国底图：合并成一个 Mesh 的填充面 + 一层省界线。
	 * merge 为 true 把 34 个省级区的几何合成一次 draw call，只作背景无需逐省交互。
	 */
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
		const chinaTopLine = new Line(undefined, {
			// position: new Vector3(0, 0, -0.02),
			data: chinaData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			material: chinaTopLineMaterial,
			renderOrder: 3,
		});
		chinaTopLine.lineGroup.position.z += 0.01;
		return { china, chinaTopLine };
	}

	/**
	 * 广东省主体：带厚度的拉伸体 + 顶面渐变层 + 顶面描边线。
	 * 顶面单独用 BaseMap 而不是直接用拉伸体顶面，是为了能叠加自定义渐变 shader，
	 * 并让 hover 高亮只替换这一层材质；描边初始透明，入场时再淡入。
	 */
	private createProvince() {
		const mapJsonData = this._assets?.instance.getResource("mapJson") as string;
		if (!mapJsonData) {
			throw new Error("chinaData is not found");
		}
		// 顶面 / 侧面材质由工厂统一生成：顶面横向渐变、侧面流动贴图，初始 opacity 均为 0
		const [topMaterial, sideMaterial] = this.createProvinceMaterial();
		this._focusMapTopMaterial = topMaterial;
		this._focusMapSideMaterial = sideMaterial;
		const map = new ExtrudeMap(
			{ assets: this._assets as Assets, time: this.time },
			{
				geoProjectionCenter: this._geoProjectionCenter,
				geoProjectionScale: this._geoProjectionScale,
				// 抬高 0.11 让拉伸体底面压在扩散层之上，避免共面闪烁
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
		// 默认材质与高亮材质分开保存：hover 时整块替换，移出时换回默认，不影响其它区县
		this._defaultMaterial = faceMaterial;
		this._defaultLightMaterial = this._defaultMaterial.clone();
		this._defaultLightMaterial.color = new Color("rgba(115,208,255,1)");
		this._defaultLightMaterial.opacity = 0.8;
		// this.defaultLightMaterial.emissive.setHex(new Color("rgba(115,208,255,1)"));
		// this.defaultLightMaterial.emissiveIntensity = 3.5;
		// 顶面取 depth + 0.22（高度 0.72），比拉伸体顶端 0.61 高 0.11，盖住接缝不留缝
		const mapTop = new BaseMap(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			position: new Vector3(0, 0, this._depth + 0.22),
			data: mapJsonData,
			material: faceMaterial,
			renderOrder: 2,
		});
		// 每个区县是 Object3D，其下每个多边形环一个 Mesh；把 Mesh 收集起来做射线拾取
		mapTop.mapGroup.children.forEach((group) => {
			group.children.forEach((mesh) => {
				if (mesh.type === "Mesh") {
					this._eventElement.push(mesh);
				}
			});
		});
		// 描边用白色、初始全透明，靠时间轴把 opacity 补到 1
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
		// 比顶面再高 0.01，避免描边与顶面共面导致线条断续
		mapLine.lineGroup.position.z += this._depth + 0.23;
		return {
			map,
			mapTop,
			mapLine,
		};
	}

	/**
	 * 生成顶面 / 侧面材质。
	 * 第三个参数是顶面渐变在 x 方向的归一化宽度，取广东在 120 缩放下的横向跨度 15.78；
	 * 与 _geoProjectionScale 不匹配时渐变会过早或过晚结束，配色分界对不上版图。
	 */
	private createProvinceMaterial() {
		return createMapMaterials(this._assets, this.time, "15.78");
	}

	/**
	 * 创建指标光柱：柱体 + 纵向渐变 + 柱底光圈 + 柱顶数值标签。
	 * 只取 value 最高的 7 个地市——21 个地市全部立杆会让珠三角挤成一团、
	 * 标签彼此叠压，7 根也能与飞线终点数量保持一致。
	 */
	private createBar() {
		// sortByValue 会原地把 provincesData 排成降序，后续 createFlyLine 直接复用这个顺序
		const data = sortByValue(provincesData).filter((_item, index) => index < 7);
		const barGroup = new Group();
		this._barGroup = barGroup;
		// 0.7 是整体尺寸系数，同时作用于柱体截面与最大高度，便于一处调整视觉量级
		const factor = 0.7;
		const height = 4.0 * factor;
		// data 已按 value 降序，首项即最大值，作为柱高归一化分母
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
			// 渐变尺寸取柱高，高度变化时色带不被拉伸；后 3 根（index 4~6）换暖色，与前 4 根区分梯队
			new GradientShader(material, {
				uColor1: index > 3 ? 0xfbdf88 : 0x50bbfe,
				uColor2: index > 3 ? 0xfffef4 : 0x77fbf5,
				size: geoHeight,
				dir: "y",
			});
			const geo = new BoxGeometry(0.1 * factor, 0.1 * factor, geoHeight);
			// 几何体原点默认在柱体中心，上移半高让原点落在柱底，
			// 入场时 z 轴缩放才是「从地面长出来」而不是向两端膨胀
			geo.translate(0, 0, geoHeight / 2);
			const mesh = new Mesh(geo, material);
			mesh.renderOrder = 5;
			const areaBar = mesh;
			// 投影结果的 y 轴向下，Three.js 的 y 轴向上，故取负号翻正；
			// z 取 depth + 0.45，比拉伸体顶面再高一点，柱底不会埋进地块
			const [x, y] = this.geoProjection(item.centroid as [number, number]);
			areaBar.position.set(x, -y, this._depth + 0.45);
			// 初始 z 缩放为 0，时间轴按 index 错峰补到 1
			areaBar.scale.set(1, 1, 0);
			areaBar.userData = { ...item };
			// 光圈面片自身已放平，位置用世界坐标 (x, 高度, z)：高度 0.44 略低于柱底 0.45
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
			// 整组放平后，柱体局部 z 轴才对应世界坐标的竖直方向
			barGroup.rotation.x = -Math.PI / 2;
			// 标签比柱底高 0.65，并随柱高上移，始终悬在柱顶上方而不被柱体穿过
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
	 * 注册区县顶面的鼠标事件：悬停换高亮材质、移出换回、按下时打印区县名。
	 * objectsHover 只做进出记录（进入去重入栈、移出按 name 过滤），
	 * "保留栈顶高亮"的分支被注释成无效语句，还原始终无条件执行。
	 */
	private createEvent() {
		let objectsHover: Object3D[] = [];
		/** 把整块区县的所有 Mesh 换回默认材质 */
		const reset = (mesh: Object3D) => {
			mesh.traverse((obj) => {
				if ("isMesh" in obj && obj.isMesh) {
					(obj as Mesh).material = this
						._defaultMaterial as MeshStandardMaterial;
				}
			});
		};
		/** 把整块区县的所有 Mesh 换成高亮材质；逐 Mesh 替换是因为一个区县可能有多个多边形环 */
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

	/**
	 * 光柱外层的体积光：三张交叉的透明平面叠出柔光边缘。
	 * @param h 光柱高度（世界单位），与柱体保持一致
	 * @param color 光柱颜色，0x 十六进制
	 */
	private createHUIGUANG(h: number, color: number) {
		return createGlowPillar(this._assets, h, color);
	}

	/**
	 * 柱底双层光圈，返回的组由时间轴放大入场。
	 * 旋转直接绑在 tick 上，每帧固定加 0.05 弧度，转速会随帧率变化。
	 * @param position 光圈中心的世界坐标 (x, 高度, z)，注意不是投影后的 y
	 */
	private createQuan(position: Vector3Like, _index: number) {
		const { group, rotatingMesh } = createBarHalo(this._assets, position);
		// 该字段只保留最后一次赋值的组，渲染不依赖它；真正的引用在 _allGuangquan 里
		this._quanGroup = group;
		this.scene.add(group);
		this.time.on("tick", () => {
			rotatingMesh.rotation.z += 0.05;
		});
		return group;
	}

	/** 地图下方的同心扩散波，压在拉伸体底下，随 tick 自动扩张淡出 */

	private createDiffuse() {
		createMapDiffuse({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/** 背景网格：给悬空的地图一个空间参照，renderOrder 最低 */
	private createGrid() {
		createMapGrid({ scene: this.scene, time: this.time, assets: this._assets });
	}

	/** 底部深色光海：铺满地图下方的背景面，避免黑色场景直接露底 */
	private createBottomBg() {
		createMapOcean({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/** 全国底图外侧的模糊边线，弱化省界硬边，突出中心亮区 */
	private createChinaBlurLine() {
		createMapBlurLine({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/**
	 * 创建全国底图上的全部 CSS3D 标签：省级装饰名、广东主标题与两个图标。
	 * 装饰名来自 china-decoration.ts，hide 的省份跳过、blur 的省份做模糊弱化；
	 * 主标题锚点见 defaultMapFocusLabelInfo，故意放在广东以南的海面。
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
					// 粤东外海的大图标，reflect 打开后带倒影，用来平衡右侧构图
					center: [118.280637, 21.625178],
					width: "40px",
					height: "40px",
					reflect: true,
				},
				{
					icon: labelIcon,
					// 版图西侧的小图标，尺度减半，避免与广西、贵州的省名标签抢视线
					center: [106.280637, 25.625178],
					width: "20px",
					height: "20px",
					reflect: false,
				},
			],
		);
	}

	/** 地图外围的两圈反向旋转光环，初始缩为 0，入场时再展开 */
	private createRotateBorder() {
		[this._rotateBorder1, this._rotateBorder2] = createRotationBorders({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/**
	 * 以广州为起点，向 provincesData 前 7 项的 centroid 各画一条拱形飞线。
	 * 这 7 项与 createBar 是同一批（数据已被原地降序），保证飞线终点与光柱一一对应；
	 * 广州一项起终点重合，贝塞尔控制点抬到 z=3，实际生成一根原地竖起的短弧管。
	 * 飞线组先隐藏，等地图展开完成后由时间轴打开。
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
			() => provincesData.filter((_item, index) => index < 7),
		);
	}

	/**
	 * 飞线汇聚点的脉冲光圈：与飞线同时显隐。
	 * 位置取 depth + 0.44；父组已放平，传入的 z 会成为世界高度。
	 */
	private createFocus() {
		const focusObj = new Focus(
			{ assets: this._assets as Assets },
			{ color1: 0xbdfdfd, color2: 0xbdfdfd },
		);
		const [x, y] = this.geoProjection(this._flyLineCenter);
		focusObj.position.set(x, -y, this._depth + 0.44);
		focusObj.scale.set(1, 1, 1);
		this._flyLineFocusGroup.add(focusObj);
	}

	/**
	 * 上升粒子：10 个点在 30 单位范围内向上缓慢漂移，用叠加混合做底部光尘。
	 * range 取 30 是为了盖住整块地图而非只在某一角落；speed 0.05 保证几乎不抢镜。
	 */
	private createParticles() {
		this._particles = new Particles(
			{ time: this.time },
			{
				num: 10,
				range: 30,
				dir: "up",
				speed: 0.05,
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

	/**
	 * 箭头散点：每个点是一个始终朝向相机的 Sprite，大小按 value 归一化。
	 * sortByValue 原地降序，保证首项是最大值，作为 populateMapScatter 内部的缩放分母。
	 */
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
	 * 监测点：贴图 Sprite + 一张默认隐藏的详情卡。
	 * 尺寸按 value / 最大值 映射到 0.7~1.1；颜色按索引在暖白与青色之间交替。
	 * 点击后隐藏所有卡片、只显示当前点，并启动 3 秒轮播；
	 * _clicked 在 mousedown 置位、mouseup 复位，避免按住时反复触发。
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
		const infoAllData = sortByValue(infoData);
		const max = infoAllData[0].value;
		infoAllData.forEach((data, index) => {
			const material = new SpriteMaterial({
				map: texture,
				color: colors[index % colors.length],
				fog: false,
				transparent: true,
				depthTest: false,
			});
			const sprite = new Sprite(material);
			sprite.renderOrder = 23;
			// 以最大 value 为基准归一化，最强点固定 0.7 + 0.4 = 1.1 倍
			const scale = 0.7 + (data.value / max) * 0.4;
			sprite.scale.set(scale, scale, scale);
			const [x, y] = this.geoProjection([data.lng, data.lat]);
			const position = [x, -y, this._depth + 0.7];
			sprite.position.set(position[0], position[1], position[2]);
			// 上一行的 position 随即被下面整体覆盖，最终生效的是带业务字段的对象
			sprite.userData.position = [...position];
			sprite.userData = {
				position: [x, -y, this._depth + 0.7],
				name: data.name,
				value: data.value,
				level: data.level,
				index: index,
			};
			this._infoPointGroup?.add(sprite);
			// 详情卡是 Sprite 形式的 CSS3D，始终正对相机；verticalOffset 1.9 让它浮在点位上方
			const label = createMonitoringLabel(
				{
					label3d,
					labelGroup: this._infoPointGroup as Group,
					project: (point) => this.geoProjection(point),
				},
				data,
				{
					depth: this._depth,
					verticalOffset: 1.9,
					valueLabel: "PM2.5",
					valueUnit: "ug/m²",
				},
			);
			this._infoLabelElement.push(label);
			this._interactionManager.add(sprite);
			sprite.addEventListener("mousedown" as keyof Object3DEventMap, (ev) => {
				// 地图尚未展开（隐藏）时忽略点击，避免入场阶段误触发轮播
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
	 * 监测点详情卡轮播：每 3 秒把可见卡片切到下一个点，到末尾回到第一个。
	 * 每次调用先清掉旧定时器，避免连续点击叠加出多条并行轮播。
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
	 * 广东省轮廓流光：用 Line3 沿轮廓生成细管，贴图 offset 每帧右移形成环绕光带。
	 * 挂在 _focusMapGroup 下，跟随主体一起做入场缩放，不会与地块错位。
	 */
	private createStorke() {
		const mapStroke = this._assets?.instance.getResource("mapStroke") as string;
		const texture = this._assets?.instance.getResource("pathLine3") as Texture;
		if (!mapStroke || !texture) {
			throw new Error("mapStroke or pathLine3 texture not found");
		}
		texture.wrapS = texture.wrapT = RepeatWrapping;
		// 横向重复 2 次让光带更密；RepeatWrapping 是 offset 循环滚动的前提
		texture.repeat.set(2, 1);
		const pathLine = new Line(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
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
			tubeRadius: 0.03,
		});
		// 设置父级
		this._focusMapGroup?.add(pathLine.lineGroup);
		this.time.on("tick", () => {
			// 每帧固定步长推进贴图偏移，配合 RepeatWrapping 形成无缝流光
			texture.offset.x += 0.005;
		});
	}

	/**
	 * 入场时间轴，按「镜头推近 → 广东展开 → 材质与标签淡入 → 光柱生长」四段编排：
	 * - 0~2s：相机从全国远景推到广东近景，推镜时先隐藏汇聚点光圈；
	 * - 1.5s（focusMap）：广东组从 z 压扁状态归位并展开到 1，完成后打开飞线 / 散点 / 监测点；
	 * - 2s（focusMapOpacity）：顶面、侧面淡入，省名标签逐个错峰浮现，描边与旋转圆环随后登场；
	 * - 3s（bar）：光柱按名次错峰拔起，柱顶数字做 0 到目标值的滚动。
	 * 时间轴创建后先 pause，由 Map3D.play 统一起播，保证与 loading 淡出对齐。
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
		// 三个标签分别对齐各段的起播时刻，后面的补间用标签名定位而不是累加时间
		tl.addLabel("focusMap", 1.5);
		tl.addLabel("focusMapOpacity", 2);
		tl.addLabel("bar", 3);
		// 不带位置参数即从 0 时刻起播，2s 的 circ.out 推镜构成整段入场的第一幕
		tl.to(this.camera.instance.position, {
			duration: 2,
			x: -0.17427287762525134,
			y: 13.678992786206543,
			z: 20.688611202093714,
			ease: "circ.out",
			onStart: () => {
				// 推镜阶段先藏起汇聚点光圈，等飞线出现后再亮
				this._flyLineFocusGroup.visible = false;
			},
		});
		// 把广东组从 -0.01 的位置推回 0，与 z 轴展开同时进行，视觉上是「浮起并铺开」
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
					// 广东完全展开后再亮出依附在地图上的飞线、散点与监测点，避免提前悬空
					(this._flyLineGroup as Group).visible = true;
					(this._scatterGroup as Group).visible = true;
					(this._infoPointGroup as Group).visible = true;
					this.createInfoPointLabelLoop();
				},
			},
			"focusMap",
		);

		// 顶面材质从全透明淡入，避免首帧闪白
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
					// 淡入结束后不再需要混合，关掉 transparent 让侧面恢复深度写入
					(
						this._focusMapSideMaterial as NonNullable<
							typeof this._focusMapSideMaterial
						>
					).transparent = false;
				},
			},
			"focusMapOpacity",
		);
		// 省名标签按索引错峰 0.1s，从下往上推入，避免整屏文字同时出现
		this._otherLabel.forEach((item, index) => {
			const element = item.element.querySelector("#other-label");
			tl.to(
				element,
				{
					duration: 1,
					delay: 0.1 * index,
					translateY: 0,
					opacity: 1,
					ease: "circ.out",
				},
				"focusMapOpacity",
			);
		});
		// 描边略晚于材质淡入，先有面再有线，轮廓才不会浮在空白上
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
					// 圆环展开是本段最后一个动作：亮出汇聚点光圈，并通知 Map3D 开始 UI 入场
					this._flyLineFocusGroup.visible = true;
					this._onPlayComplete?.();
				},
			},
			"focusMapOpacity",
		);
		this._allBar.forEach((item, index) => {
			// 广州是飞线汇聚点，柱体会与中心光圈重叠，因此跳过它的生长补间
			if (item.userData.name === "广州市") {
				return;
			}
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

		// 柱顶标签：面板上移入场，同时用一个中间对象驱动数值从 0 滚到目标值
		this._allProvinceLabel.forEach((item, index) => {
			const element = item.element.querySelector("#provinces-label-wrap");
			const number = item.element.querySelector(
				"#number #value",
			) as HTMLDivElement;
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
			// 每帧把补间值写回 DOM；取整避免出现小数位跳动
			function showScore() {
				number.innerText = numberAnimate.score.toFixed(0);
			}
		});
		// 双层光圈同步绽放；children[0] 为上层、children[1] 为略下沉的底层
		this._allGuangquan.forEach((item, index) => {
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
	 * 使用 d3-geo 的墨卡托投影：以 _geoProjectionCenter 为原点、_geoProjectionScale 为缩放，
	 * translate 固定为 (0, 0)，因此投影中心恰好落在世界原点。
	 * @param args [经度, 纬度]，东经 / 北纬为正
	 * @returns [x, y]，y 轴向下（屏幕方向）；调用方需取 (x, -y) 翻成 Three.js 的 y 向上
	 */
	private geoProjection(args: [number, number]) {
		return geoMercator()
			.center(this._geoProjectionCenter)
			.scale(this._geoProjectionScale)
			.translate([0, 0])(args) as [number, number];
	}

	/** 每帧先跑场景核心的相机 / 渲染，再让拾取管理器做一次射线检测 */
	update() {
		super.update();
		this._interactionManager?.update();
	}

	/**
	 * 销毁顺序：定时器 → 主时间轴 → 拾取管理器 → 标签渲染器 → 光标 → 场景核心。
	 * 定时器与时间轴先停，防止销毁过程中回调继续改 scene 里的对象；
	 * 拾取管理器要先于场景释放，否则它持有的事件元素会在 super.destroy 后变成悬空引用；
	 * 最后 super.destroy 统一 dispose 几何体 / 材质并把 canvas 摘出 DOM。
	 */
	destroy() {
		if (this._infoPointLabelTime) {
			clearInterval(this._infoPointLabelTime);
			this._infoPointLabelTime = null;
		}
		this._animateTl?.kill();
		this._interactionManager.dispose();
		this._label3d.destroy();
		// 鼠标可能停在地图上被销毁，恢复默认光标避免指针状态残留
		document.body.style.cursor = "default";
		super.destroy();
	}
}

/**
 * 中国大屏的三维场景描述。
 * 继承 shared/map/world-core 的 WorldCore，复用广东大屏的公共地图底层
 * （周边底图、光柱、飞线、散点、标注、材质与着色器），只在这里组装
 * 本屏特有的图层顺序、投影参数与入场时间线。
 * 由 index.tsx 通过 Map3D 的 world 选项实例化，destroy 由 Map3D 触发。
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
import infoData from "./data/info";
import labelData from "./data/labels";
import { chinaRegions } from "./data/regions";
import scatterData from "./data/scatter";

/** 经纬度坐标对，顺序固定为 [经度, 纬度]，与 GeoJSON 的 [lng, lat] 一致。 */
export type Point = [number, number];

/** 全国视角的聚焦标注文案，锚点取在南海方向（[110, 15.5]），让主标题落在南海海域。 */
const defaultMapFocusLabelInfo: WorldMapFocusLabelInfo = {
	name: "中国",
	enName: "PEOPLE'S REPUBLIC OF CHINA",
	center: [110, 15.5],
	// 英文全称明显长于中文，居中对齐才不会让「中国」偏到左侧
	align: "center",
};

/**
 * 中国大屏场景。
 * 与广东大屏保持同一套场景比例，便于复用视觉参数。
 * 图层从下到上依次为：海洋底图 → 网格 → 旋转光框 → 周边国家底图 →
 * 省份挤出体 → 顶面高亮面 → 省界线 → 光柱/光圈 → 飞线/散点/信息点 → 3D 标注。
 */
export default class ChinaWorld extends WorldCore {
	private readonly _assets: Assets;
	private readonly _interactionManager: InteractionManager;

	/**
	 * 墨卡托投影中心，取中国地理中心附近（约 104.3°E、35.7°N），
	 * 让地图轮廓尽量落在画面中央，避免东部沿海被推到边缘。
	 */
	private readonly _geoProjectionCenter: Point = [104.3, 35.7];
	/** 投影缩放基准：同时作用于底图、挤出体、轮廓线与所有点的 geoProjection */
	private readonly _geoProjectionScale = 14;
	/** 飞线汇聚点，取北京坐标；同时作为焦点光圈落点与「全国」视角中心 */
	private readonly _flyLineCenter: Point = [116.405285, 39.904989];
	/** 省份挤出厚度（世界坐标），顶面、轮廓线的 z 偏移都基于它叠加 */
	private readonly _depth = 0.5;
	/** 地图宽度基准（世界坐标），作为顶面渐变 shader 的归一化跨度，控制色带宽度 */
	private readonly _mapWidth = 15.05;
	private readonly _mapFocusLabelInfo = defaultMapFocusLabelInfo;
	/** 入场时间线播完的回调，由 Map3D 传入，用来触发 UI 面板入场 */
	private readonly _onPlayComplete?: () => void;

	/** 3D 标注的挂载容器，整体绕 X 轴旋转 -90° 让平面贴图与地图平面平行 */
	private _labelGroup!: Group;
	/** 基于 CSS3D 的标注渲染器，负责把 DOM 标签投影到三维位置 */
	private _label3d!: Label3D;
	/** 飞线焦点光圈的容器，单独一组是为了在镜头推进时整体显隐 */
	private _flyLineFocusGroup!: Group;

	/** 参与鼠标悬停高亮的省份顶面网格，来自 mapTop 的子节点 */
	private _eventElement: Object3D[] = [];
	/** 省份顶面默认材质（青蓝渐变），鼠标移出时还原 */
	private _defaultMaterial: MeshStandardMaterial | null = null;
	/** 悬停时替换的提亮材质，颜色更浅、透明度更高 */
	private _defaultLightMaterial: MeshStandardMaterial | null = null;

	/** 外圈两道旋转装饰光框，时间线里从 0 缩放到 1 */
	private _rotateBorder1: Mesh | null = null;
	private _rotateBorder2: Mesh | null = null;
	/** 省份挤出体所在的分组，入场时做 z 轴缩放（从扁平「长」出来） */
	private _focusMapGroup: Group | null = null;
	/** 挤出体顶面材质，透明度由时间线从 0 补间到 1 */
	private _focusMapTopMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	/** 挤出体侧面材质，播完后关闭 transparent 以减少混合开销 */
	private _focusMapSideMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	/** 省界线材质，初始 opacity 为 0，随入场时间线淡入 */
	private _mapLineMaterial: LineBasicMaterial | null = null;
	/** 全部指标柱的容器，整体旋转到地图平面 */
	private _barGroup: Group | null = null;
	/** 指标柱网格，与 _allBarMaterial、_allGuangquan、_allProvinceLabel 同索引对应 */
	private _allBar: Mesh[] = [];
	private _allBarMaterial: MeshBasicMaterial[] = [];
	/** 柱底旋转光圈，children[0] / children[1] 分别是内外两圈 */
	private _allGuangquan: Group[] = [];
	/** 柱顶的省份数值标签（CSS3D） */
	private _allProvinceLabel: Label[] = [];
	/** 静态装饰标签：省份名（含无柱省份）、中心主标题与两个图标，入场时错峰淡入 */
	private _otherLabel: Label[] = [];
	/** 飞线与散点、信息点三个图层默认隐藏，等镜头推进结束后再出现 */
	private _flyLineGroup: Group | null = null;
	private _particleGroup: Group | null = null;
	private _scatterGroup: Group | null = null;
	/** 信息点（Sprite + 卡片标签）容器，点击后进入 3 秒轮播 */
	private _infoPointGroup: Group | null = null;
	private _infoLabelElement: Label[] = [];
	/** 当前轮播到的信息点下标，越界后回到 0 */
	private _infoPointIndex = 0;
	/** 点击防抖标记：mousedown 置位、mouseup 复位，避免同一次点击重复启动轮播 */
	private _clicked = false;
	/** 入场时间线，构造时创建并 pause，由 Map3D 的 play 调用 resume */
	private _animateTl: gsap.core.Timeline | null = null;
	/** 信息点标签轮播定时器，destroy 时必须手动清理 */
	private _infoPointLabelTime: ReturnType<typeof setInterval> | null = null;

	/**
	 * 构建场景：先设置雾与背景色、初始机位，再初始化环境与全部图层。
	 * @param canvas 渲染目标画布，同时作为交互事件源
	 * @param assets 已加载完成的资源池，geojson 与贴图都从这里取
	 * @param options onPlayComplete 用于在入场动画结束时通知外层播放 UI 时间线
	 */
	constructor(
		canvas: HTMLCanvasElement,
		assets: Assets,
		options: MapWorldOptions = {},
	) {
		super(canvas);
		this._assets = assets;
		this._onPlayComplete = options.onPlayComplete;
		// 深蓝雾把远处底图压暗，同时让海洋背景与场景边界自然融合
		this.scene.fog = new Fog(0x102736, 1, 50);
		this.scene.background = new Color(0x102736);
		// 初始机位是斜俯视全景，时间线第一段会把它推近到接近正俯视
		this.camera.instance.position.set(
			-13.767695123014105,
			12.990152163077308,
			39.28228164159694,
		);
		// near/far 覆盖整张地图到背景层的距离，过小会导致远处底图被裁掉
		this.camera.instance.near = 1;
		this.camera.instance.far = 10000;
		this.camera.instance.updateProjectionMatrix();
		// three.interactive 依赖 canvas 上的 DOM 事件做射线拾取
		this._interactionManager = new InteractionManager(
			this.renderer.instance,
			this.camera.instance,
			canvas,
		);
		this.initEnvironment();
		this.init();
	}

	/** 入场时间线。构造时已 pause，调用方需在资源就绪后走 Map3D.play 恢复播放。 */
	get animateTl() {
		return this._animateTl as gsap.core.Timeline;
	}

	/**
	 * 按「由远及近、由底到上」的顺序搭场景。
	 * 调用顺序有依赖：createMap 之前必须先有 label3d 与 flyLineFocusGroup，
	 * createAnimationTimeline 依赖前面所有图层已经创建完毕。
	 */
	private init() {
		this._labelGroup = new Group();
		this._label3d = new Label3D({
			canvas: this.canvas,
			sizes: this.sizes,
			scene: this.scene,
			camera: this.camera,
			time: this.time,
		});
		// 标注容器与地图平面同向：X 轴 -90° 后，group 内的 z 轴等价于场景的 y 轴
		this._labelGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._labelGroup);

		this._flyLineFocusGroup = new Group();
		this._flyLineFocusGroup.visible = false;
		this._flyLineFocusGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._flyLineFocusGroup);

		this._eventElement = [];
		this._defaultMaterial = null;
		this._defaultLightMaterial = null;

		this.createBottomBg();
		this.createGrid();
		this.createRotateBorder();
		this.createLabel();
		this.createMap();
		this.createEvent();
		this.createFlyLine();
		this.createFocus();
		this.createParticles();
		this.createScatter();
		this.createInfoPoint();
		this.createStorke();
		// 时间线必须最后建：它引用的光柱、标注、材质都要已经存在
		this.createAnimationTimeline();
	}

	/** 环境灯光与反射，交给公共层统一配置，保证几块大屏的光照基调一致。 */
	private initEnvironment() {
		createMapEnvironment(this.scene);
	}

	/**
	 * 组装地图主体。
	 * 周边国家底图平铺在 scene 下，省份挤出体则放进 focusMapGroup：
	 * 后者初始 z 轴缩放为 0，靠入场时间线「长高」，所以必须独立成组。
	 */
	private createMap() {
		const mapGroup = new Group();
		const focusMapGroup = new Group();
		this._focusMapGroup = focusMapGroup;
		const { surrounding, surroundingLine } = this.createSurrounding();
		const { map, mapTop, mapLine } = this.createProvince();
		surrounding.setParent(mapGroup);
		surroundingLine.setParent(mapGroup);
		this.createDiffuse();
		map.setParent(focusMapGroup);
		mapTop.setParent(focusMapGroup);
		mapLine.setParent(focusMapGroup);
		// 整体下移 0.01 并压扁，避免与周边底图共面产生 z-fighting
		focusMapGroup.position.set(0, 0, -0.01);
		focusMapGroup.scale.set(1, 1, 0);
		mapGroup.add(focusMapGroup);
		// 整个分组绕 X 轴 -90°，使 GeoJSON 的平面 XY 转成场景的水平面
		mapGroup.rotation.x = -Math.PI / 2;
		// y 轴 0.2 是地图整体的悬空高度，给下方海洋层留出空间
		mapGroup.position.set(0, 0.2, 0);
		this.scene.add(mapGroup);
		this.createBar();
	}

	/**
	 * 周边国家陆地背景，对应广东大屏的中国底图。
	 * 与主地图共用同一套投影中心和缩放，否则两边轮廓对不齐。
	 */
	private createSurrounding() {
		const params = {
			surroundingBgMaterialColor: "#1a3853",
			lineColor: "#3f82cd",
		};
		const surroundingData = this._assets.instance.getResource(
			"world",
		) as string;
		if (!surroundingData) {
			throw new Error("worldData is not found");
		}
		const surroundingBgMaterial = new MeshLambertMaterial({
			color: new Color(params.surroundingBgMaterialColor),
			transparent: true,
			opacity: 1,
		});
		// merge: true 把多国轮廓合并成一个几何体，减少 draw call
		const surrounding = new BaseMap(undefined, {
			data: surroundingData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			merge: true,
			material: surroundingBgMaterial,
			renderOrder: 2,
		});
		const surroundingTopLineMaterial = new LineBasicMaterial({
			color: params.lineColor,
			transparent: true,
			opacity: 0.62,
		});
		const surroundingLine = new Line(undefined, {
			data: surroundingData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			material: surroundingTopLineMaterial,
			renderOrder: 3,
		});
		// 轮廓线抬高一点再绘制，否则与填充面共面会被遮挡
		surroundingLine.lineGroup.position.z += 0.01;
		return { surrounding, surroundingLine };
	}

	/**
	 * 中国主体：挤出体、顶面高亮面、省界线三层。
	 * 顶面高亮面同时承担交互（悬停高亮），因此把它的子网格收集进 _eventElement。
	 */
	private createProvince() {
		const mapJsonData = this._assets.instance.getResource("mapJson") as string;
		if (!mapJsonData) {
			throw new Error("mapJsonData is not found");
		}
		const [topMaterial, sideMaterial] = this.createProvinceMaterial();
		this._focusMapTopMaterial = topMaterial;
		this._focusMapSideMaterial = sideMaterial;
		// 挤出体基面抬高 0.11（depth 0.5 之下），避免与底图及其顶面共面闪烁
		const map = new ExtrudeMap(
			{ assets: this._assets, time: this.time },
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
		// 顶面单独铺一层渐变着色材质：挤出体自带的顶面用于闭合并参与侧壁转角，
		// 这一层才是视觉上看到的省域表面，也是悬停换材质的对象
		const faceMaterial = new MeshStandardMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5,
		});
		new GradientShader(faceMaterial, {
			uColor1: 0x12bbe0,
			uColor2: 0x0094b5,
		});
		this._defaultMaterial = faceMaterial;
		// 克隆一份作为悬停材质，避免直接改默认材质的 uniform 影响所有省
		this._defaultLightMaterial = this._defaultMaterial.clone();
		this._defaultLightMaterial.color = new Color("rgba(115,208,255,1)");
		this._defaultLightMaterial.opacity = 0.8;
		const mapTop = new BaseMap(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			position: new Vector3(0, 0, this._depth + 0.22),
			data: mapJsonData,
			material: faceMaterial,
			renderOrder: 2,
		});
		mapTop.mapGroup.children.forEach((group) => {
			group.children.forEach((mesh) => {
				if (mesh.type === "Mesh") {
					this._eventElement.push(mesh);
				}
			});
		});
		// 省界线初始完全透明，由入场时间线单独淡入；关掉雾避免远处线条被雾吃掉
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
		// 提到顶面之上一点，保证边界线始终可见
		mapLine.lineGroup.position.z += this._depth + 0.23;
		return { map, mapTop, mapLine };
	}

	/** 生成省份顶面与侧面材质（含贴图与滚动动画），宽度基准用于顶面渐变归一化。 */
	private createProvinceMaterial() {
		return createMapMaterials(
			this._assets,
			this.time,
			this._mapWidth.toFixed(2),
		);
	}

	/**
	 * 指标柱按区域分散选取。
	 * 柱标签与广东大屏同尺寸（约 156px 宽），因此省份之间需要足够的地理间距，
	 * 否则东部沿海与中部省份的标签会互相叠压。
	 */
	private getBarRegions() {
		const regionNames = [
			"广东省",
			"上海市",
			"四川省",
			"北京市",
			"新疆维吾尔自治区",
			"黑龙江省",
		];
		return sortByValue(
			chinaRegions.filter((item) => regionNames.includes(item.name)),
		);
	}

	/**
	 * 生成六根指标光柱，柱高按 value / max 归一化。
	 * 柱体、光圈、数值标签三者的索引一一对应，入场时间线依赖这一点做错峰。
	 * 注意坐标系差异：柱体挂在绕 X 轴 -90° 的 barGroup 下，用 (x, -y) 定位；
	 * 光圈直接加到 scene，用 (x, ..., y) 定位，两者写法不同但落在同一地理位置。
	 */
	private createBar() {
		const data = this.getBarRegions();
		const barGroup = new Group();
		this._barGroup = barGroup;
		// factor 统一缩放柱子的截面与最大高度，0.7 是本屏视觉调优后的比例
		const factor = 0.7;
		const height = 4.0 * factor;
		const max = data[0].value;
		this._allBar = [];
		this._allBarMaterial = [];
		this._allGuangquan = [];
		this._allProvinceLabel = [];
		data.forEach((item, index) => {
			const geoHeight = height * (item.value / max);
			// 柱体材质初始透明，由时间线补间 opacity；depthTest 关闭保证柱体不被地图遮挡
			const material = new MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				depthTest: false,
				fog: false,
			});
			// 前四根用青蓝，后两根用米金，用颜色区分两个量级区间
			new GradientShader(material, {
				uColor1: index > 3 ? 0xfbdf88 : 0x50bbfe,
				uColor2: index > 3 ? 0xfffef4 : 0x77fbf5,
				size: geoHeight,
				dir: "y",
			});
			const geo = new BoxGeometry(0.1 * factor, 0.1 * factor, geoHeight);
			// 盒子默认以中心为原点，平移半个高度后底面才贴合地图表面
			geo.translate(0, 0, geoHeight / 2);
			const mesh = new Mesh(geo, material);
			mesh.renderOrder = 5;
			const areaBar = mesh;
			const [x, y] = this.geoProjection(item.centroid);
			areaBar.position.set(x, -y, this._depth + 0.45);
			// z 轴缩放为 0，入场时才「长」到 1
			areaBar.scale.set(1, 1, 0);
			areaBar.userData = { ...item };
			const guangQuan = this.createQuan(
				new Vector3(x, this._depth + 0.44, y),
				index,
			);
			const hg = this.createHUIGUANG(
				geoHeight,
				index > 3 ? 0xfffef4 : 0x77fbf5,
			);
			// 辉光作为柱体的子节点，跟随柱体缩放一起被拉伸
			areaBar.add(...hg);
			barGroup.add(areaBar);
			barGroup.rotation.x = -Math.PI / 2;
			const barLabel = createBarLabel(
				{
					label3d: this._label3d,
					labelGroup: this._labelGroup,
					project: (point) => this.geoProjection(point),
				},
				{
					data: item,
					index,
					// 柱顶在 depth + 0.45 + 柱高，标签再抬高 0.65（1.1 - 0.45），给数值卡留出呼吸空间
					position: new Vector3(x, -y, this._depth + 1.1 + geoHeight),
					unit: "指数",
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
	 * 省份悬停交互：进入时整省换成提亮材质，离开时还原。
	 * 由 three.interactive 提供的 mouseover/mouseout 驱动，逐个 mesh 注册。
	 */
	/**
	 * 为省份网格注册交互。
	 * 悬停计数在这里并不参与判断：objectsHover 只做进出记录（进入去重入栈、移出按 name 过滤），
	 * 材质切换与还原始终无条件执行，记录数组仅留作扩展用。
	 */
	private createEvent() {
		let objectsHover: Object3D[] = [];
		/** 还原为默认材质 */
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
				reset(event.target.parent as Object3D);
				document.body.style.cursor = "default";
			});
		});
	}

	/**
	 * 柱体整体的体积光：与柱同高的发光面片绕柱 0°/60°/120° 三向交叉叠出柔光，不是只贴在柱顶。
	 * @param h 柱体高度，辉光面片按此高度拉伸
	 * @param color 与柱体渐变色一致，保证过渡自然
	 */
	private createHUIGUANG(h: number, color: number) {
		return createGlowPillar(this._assets, h, color);
	}

	/**
	 * 柱底旋转光圈。
	 * @param position 世界坐标 [x, y, z]；调用方传入的是已转成 (x, 高度, y) 的值，
	 * 因为光圈直接挂在未旋转的 scene 下，不需要再翻 Z 轴
	 * @param _index 当前未使用，保留以对齐批量创建时的签名
	 */
	private createQuan(position: Vector3Like, _index: number) {
		const { group, rotatingMesh } = createBarHalo(this._assets, position);
		this.scene.add(group);
		// 每帧固定增量旋转，速度与帧率无关但视觉上足够平滑
		this.time.on("tick", () => {
			rotatingMesh.rotation.z += 0.05;
		});
		return group;
	}

	/** 地图表面的流动漫射层，做整体呼吸效果。 */
	private createDiffuse() {
		createMapDiffuse({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/** 地面网格，提供纵深感与比例参考。 */
	private createGrid() {
		createMapGrid({ scene: this.scene, time: this.time, assets: this._assets });
	}

	/** 最底层的海洋背景，兜住地图之外的画面。 */
	private createBottomBg() {
		createMapOcean({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/**
	 * 省份文字标签。
	 * labelData 只保留无光柱的空旷省份；末尾两个图标分别是东侧与西侧的装饰点位，
	 * 40px 的那个带 reflect 做镜像翻转，用来标示海疆方向。
	 */
	private createLabel() {
		this._otherLabel = createMapLabels(
			{
				label3d: this._label3d,
				labelGroup: this._labelGroup,
				project: (point) => this.geoProjection(point),
			},
			labelData,
			this._mapFocusLabelInfo,
			[
				{
					icon: labelIcon,
					center: [124.5, 33.0],
					width: "40px",
					height: "40px",
					reflect: true,
				},
				{
					icon: labelIcon,
					center: [92.5, 40.0],
					width: "20px",
					height: "20px",
					reflect: false,
				},
			],
		);
	}

	/** 外圈两道旋转光框，初始 scale 为 0，入场时错峰放大到 1。 */
	private createRotateBorder() {
		[this._rotateBorder1, this._rotateBorder2] = createRotationBorders({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	/** 以北京为起点的飞线层，终点取有指标柱的省份，默认隐藏到镜头推进后。 */
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
			() => this.getBarRegions(),
		);
	}

	/** 飞线汇聚点上的双层光圈，与飞线同组，一起在入场结束时显形。 */
	private createFocus() {
		const focusObj = new Focus(
			{ assets: this._assets },
			{ color1: 0xbdfdfd, color2: 0xbdfdfd },
		);
		const [x, y] = this.geoProjection(this._flyLineCenter);
		focusObj.position.set(x, -y, this._depth + 0.44);
		focusObj.scale.set(1, 1, 1);
		this._flyLineFocusGroup.add(focusObj);
	}

	/**
	 * 上升粒子层。
	 * num/range/speed 均为世界坐标量纲；AdditiveBlending 让粒子叠加处更亮，
	 * depthWrite 关闭避免透明粒子互相遮挡出现黑边。
	 */
	private createParticles() {
		const particles = new Particles(
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
		particles.setParent(this._particleGroup);
		particles.enable = true;
		this._particleGroup.visible = true;
	}

	/** 城市散点层，按 value 降序传给公共层，绘制顺序与数值大小一致。 */
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
			() => sortByValue([...scatterData]),
		);
	}

	/**
	 * 重点枢纽信息点。
	 * 用 Sprite 而非 Mesh：始终朝向相机，且不受地图平面旋转影响。
	 * 每个点配一张 3D 卡片标签，默认全部隐藏，由 createInfoPointLabelLoop 轮播。
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
		const texture = this._assets.instance.getResource("point") as Texture;
		if (!texture) {
			throw new Error("point texture not found");
		}
		const colors = [0xfffef4, 0x77fbf5];
		const infoAllData = sortByValue([...infoData]);
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
			// 图标大小随指标值在 0.7~1.1 之间变化，只做轻微区分，避免遮挡地图
			const scale = 0.7 + (data.value / max) * 0.4;
			sprite.scale.set(scale, scale, scale);
			const [x, y] = this.geoProjection([data.lng, data.lat]);
			const position = [x, -y, this._depth + 0.7];
			sprite.position.set(position[0], position[1], position[2]);
			sprite.userData = {
				position: [...position],
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
					verticalOffset: 3.6,
					valueLabel: "算力指数",
					valueUnit: "",
				},
			);
			this._infoLabelElement.push(label);
			this._interactionManager.add(sprite);
			sprite.addEventListener("mousedown" as keyof Object3DEventMap, (ev) => {
				// _clicked 做防抖：mousedown 后要等 mouseup 才允许下一次点击
				if (this._clicked || !this._infoPointGroup?.visible) return false;
				this._clicked = true;
				this._infoPointIndex = ev.target.userData.index;
				this._infoLabelElement.forEach((label) => {
					label.visible = false;
				});
				label.visible = true;
				// 重新开一个轮播：内部会先清掉旧定时器，保证同一时刻只有一个在跑
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
	 * 信息点卡片轮播。
	 * 每 3 秒切到下一个点，循环播放；先 clearInterval 再新建，
	 * 避免点击不同点时叠加出多个定时器。定时器句柄存字段供 destroy 清理。
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
	 * 沿海疆界的流动描边。
	 * 用管状线条（Line3）承载可重复滚动的贴图：靠每帧递增 texture.offset.x 制造流动感，
	 * 贴图在 S 方向平铺 2 次，加快视觉流速而不用改偏移步长。
	 */
	private createStorke() {
		const mapStroke = this._assets.instance.getResource("mapStroke") as string;
		const texture = this._assets.instance.getResource("pathLine3") as Texture;
		if (!mapStroke || !texture) {
			throw new Error("mapStroke or pathLine3 texture not found");
		}
		texture.wrapS = texture.wrapT = RepeatWrapping;
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
			tubeSegments: 720,
		});
		this._focusMapGroup?.add(pathLine.lineGroup);
		this.time.on("tick", () => {
			texture.offset.x += 0.005;
		});
	}

	/**
	 * 入场时间线。
	 * 用命名 label（focusMap / focusMapOpacity / bar）当时间锚点，让同一批补间并行推进，
	 * 整体节奏：镜头推近（0~2s）→ 地图从扁平「长」出（1.5~2.5s）、材质淡入（2~3s）→ 光柱升起（3s 起）。
	 * 时间线创建后立即 pause，等资源加载完成由 Map3D.play 恢复，避免加载期间空跑。
	 */
	private createAnimationTimeline() {
		const tl = gsap.timeline({
			onComplete: () => {},
		});
		tl.pause();
		this._animateTl = tl;
		// label 的第二个参数是绝对时间（秒），不是相对偏移
		tl.addLabel("focusMap", 1.5);
		tl.addLabel("focusMapOpacity", 2);
		tl.addLabel("bar", 3);
		// 第一段只动相机：从斜俯视全景落到接近正俯视的机位
		tl.to(this.camera.instance.position, {
			duration: 2,
			x: -0.17427287762525134,
			y: 13.678992786206543,
			z: 20.688611202093714,
			ease: "circ.out",
			onStart: () => {
				this._flyLineFocusGroup.visible = false;
			},
		});
		// focusMapGroup 的 z 轴缩放从 0 到 1，视觉上等于地图厚度从 0 挤出
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
					(this._flyLineGroup as Group).visible = true;
					(this._scatterGroup as Group).visible = true;
					(this._infoPointGroup as Group).visible = true;
					this.createInfoPointLabelLoop();
				},
			},
			"focusMap",
		);
		// 顶面与侧面材质从透明淡到不透明；侧面完全显现后关掉 transparent，
		// 避免整块地图长期走透明排序通道
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
					(
						this._focusMapSideMaterial as NonNullable<
							typeof this._focusMapSideMaterial
						>
					).transparent = false;
				},
			},
			"focusMapOpacity",
		);
		// 省份文字标签按下标错峰 0.1s 依次浮现，避免同一时刻全部弹出
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
		// 省界线在顶面淡入之后再出现，时长更短，作为收尾的点睛
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
		// 两道旋转光框从 0 放大，第二道（delay 0.5）结束即视为场景入场完成，
		// 此时才显示飞线焦点并回调外层播放 UI 面板动画
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
		// 光柱与材质透明度分两条补间同时推进，错峰 0.1s 形成「依次竖起」的节奏
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
		// 柱顶数值：从 DOM 里读出最终值作为补间目标，再由 onUpdate 逐帧写回文本，
		// 这样数字格式化规则只需在标签模板里维护一份
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
			function showScore() {
				number.innerText = numberAnimate.score.toFixed(0);
			}
		});
		// 光圈的缩放挂在 group 的两片子节点上，分别对应内圈与外圈
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
	 * 与 BaseMap / ExtrudeMap 内部使用完全相同的墨卡托参数（中心 + 缩放 + 零平移），
	 * 这是散点、光柱、标注能和地图轮廓对位的前提。
	 * @param args [经度, 纬度]，东经/北纬为正
	 * @returns [x, y]，y 轴向南为正（与屏幕坐标同向，挂到 -90° 的分组时需取负）
	 */
	private geoProjection(args: [number, number]) {
		return geoMercator()
			.center(this._geoProjectionCenter)
			.scale(this._geoProjectionScale)
			.translate([0, 0])(args) as [number, number];
	}

	/** 每帧渲染回调：公共层更新动画后，再刷新交互拾取所需的矩阵缓存。 */
	update() {
		super.update();
		this._interactionManager?.update();
	}

	/**
	 * 销毁场景。
	 * 顺序很重要：先停掉外部定时器与 GSAP 时间线（它们持有 DOM 与材质引用），
	 * 再释放交互管理器与标注渲染器，最后才交给父类销毁渲染器与 WebGL 上下文，
	 * 否则已销毁的对象仍会被 tick 回调访问。
	 */
	destroy() {
		if (this._infoPointLabelTime) {
			clearInterval(this._infoPointLabelTime);
			this._infoPointLabelTime = null;
		}
		this._animateTl?.kill();
		this._interactionManager.dispose();
		this._label3d.destroy();
		// 悬停时改过 body 光标，销毁后要复位，避免离开页面仍显示手型
		document.body.style.cursor = "default";
		super.destroy();
	}
}

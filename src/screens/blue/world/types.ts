/**
 * 蓝色大屏的公共类型：图层与视图枚举、GeoJSON 要素别名、监测点弹窗坐标、
 * 对外回调集合，以及相机姿态、区域过渡与入场动画的中间态结构。
 * 被 world.ts、state.ts 与各控制器共同引用；这里只描述数据形状，不含运行时逻辑。
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type gsap from "gsap";
import type { Group, Material, Object3D, Vector2, Vector3 } from "three";

/**
 * 业务图层标识，与 ChinaScene.layers / GlobeScene.layers 的容器键一一对应。
 * 开关状态单独记在 WorldState.layerEnabled 中，这里只做类型约束。
 */
export type Layer =
	/** 城市之间的货运飞线 */
	| "flyline"
	/** 地名标注容器 */
	| "label"
	/** 信息点/监测点图标 */
	| "point"
	/** 散点层（经纬度打点） */
	| "scatter"
	/** 热力面 */
	| "heat"
	/** 行政区高亮与描边 */
	| "region"
	/** 地球视图的扫描光带 */
	| "scan";

/** 顶层视图：china 为中国平面地图，globe 为三维地球 */
export type View = "china" | "globe";

/** 行政区 GeoJSON 要素；MultiPolygon 用于海岛等多面区域 */
export type MapFeature = Feature<Polygon | MultiPolygon>;

/**
 * 监测点弹窗的屏幕坐标。
 * x / y 均为相对画布左上角的 CSS 像素，由相机投影换算而来，随每帧更新。
 */
export interface MonitoringPoint {
	/** 监测点名称，用于弹窗标题 */
	name: string;
	/** 距画布左边的像素数 */
	x: number;
	/** 距画布顶部的像素数 */
	y: number;
}

/**
 * 向 Solid 层回传状态的回调集合。
 * 全部为可选：大屏可在没有外部响应的场景下独立运行，调用侧统一用 ?. 保护。
 */
export interface BlueWorldCallbacks {
	/** 点击到可下钻的行政区时触发，参数为区域名称 */
	onRegion?: (name: string) => void;
	/** 打开/移动/关闭监测点弹窗；传 null 表示关闭 */
	onMonitoringPoint?: (point: MonitoringPoint | null) => void;
	/** 首屏资源就绪（含加载失败后的兜底），用于撤掉 loading 遮罩 */
	onReady?: () => void;
	/** 当前视图发生变化时触发 */
	onViewChange?: (view: View) => void;
	/** 任意长过渡（下钻、切视图、镜头飞行）开始或结束时触发 */
	onTransitionChange?: (active: boolean) => void;
	/** 视图切换动画的阶段：idle 空闲、exit 退场、enter 入场 */
	onViewMotionChange?: (phase: "idle" | "exit" | "enter") => void;
	/** 下钻层级变化时触发，参数为从全国到当前级的名称链 */
	onDrillChange?: (path: string[]) => void;
}

/**
 * 中国视图的完整镜头快照，getMapCameraPose / restoreMapCameraPose 成对使用。
 * 下钻前压栈、返回时出栈，保证能精确回到进入前的视角。
 */
export interface MapCameraPose {
	/** 镜头观察点（世界坐标） */
	target: Vector3;
	/** 缩放倍率，1 为基准距离 */
	zoom: number;
	/** 相机俯仰角（弧度），π/2 为正俯视 */
	pitch: number;
	/** 相机绕 Y 轴的偏航角（弧度） */
	yaw: number;
	/** 地图平面自转角（弧度），同时作用于底图、地名与业务图层 */
	rotation: number;
	/** 地图自转的轴心（世界坐标的 x / z 平面，y 分量弃用） */
	rotationCenter: Vector2;
	/** 是否处于正俯视状态，影响告警标签的显示策略 */
	topView: boolean;
}

/**
 * 下钻过渡的中间态：飞行期间同时持有旧几何与新几何，
 * 由 RegionTransition 创建并推进，progress 归零后即可整体丢弃。
 */
export interface RegionGeometryTransition {
	/** 正在退场的旧几何容器 */
	outgoing: Group[];
	/** 退场前记录可见性的装饰物，过渡结束后据此恢复 */
	outgoingAccents: { object: Object3D; visible: boolean }[];
	/** 过渡期间被临时挂到其它父节点的对象及其原父节点，用于复位 */
	saved: { object: Object3D; parent: Object3D }[];
	/** 已移交销毁队列的对象，避免同一对象被重复释放 */
	retired: Set<Object3D>;
	/** 正在入场的新几何 */
	incoming: Object3D[];
	/** 新几何自带的地名，单独做淡入 */
	incomingLabels: Object3D[];
	/** 需要做 z 轴压扁/抬升的立体对象，记录原始缩放与位移 */
	depthObjects: { object: Object3D; scaleZ: number; positionZ: number }[];
	/** 起始的 z 轴压扁比例，0 表示完全压平 */
	fromDepth: number;
	/** 当前压扁比例，随 progress 从 fromDepth 升到 1 */
	depthRatio: number;
	/** z 轴位移补偿量，配合压扁避免表面穿出底图 */
	depthOffset: number;
	/** 过渡进度，0~1，线性时间值（非线性缓动由调用方另算） */
	progress: number;
	/** 由过渡接管位置与透明度的地名，frame.updateMapNames 会跳过它们 */
	frozenLabels: Set<Object3D>;
	/** 渲染顺序的临时覆盖，用于让新几何压在旧几何之上 */
	groupOrders: { group: Group; order: number }[];
	/** 特效组在过渡开始时的位置（世界坐标） */
	effectsFromPosition: Vector3;
	/** 特效组在过渡开始时的缩放 */
	effectsFromScale: Vector3;
	/** 特效组的目标位置，缺省表示不需要移动 */
	effectsToPosition?: Vector3;
	/** 特效组的目标缩放，缺省表示不需要缩放 */
	effectsToScale?: Vector3;
}

/**
 * 首屏入场动画被打断时的还原依据。
 * 记录每个图块与材质的原始状态，restoreChinaEntrance 按此逐项写回。
 */
export interface ChinaEntranceState {
	/** 入场时间线本身，中途打断时需要 kill */
	timeline?: gsap.core.Timeline;
	/** 参与 z 轴抬升的图块及其原始缩放、位移 */
	objects: {
		object: import("three").Object3D;
		scaleZ: number;
		positionZ: number;
	}[];
	/** 参与淡入的材质及其原始透明度与混合设置 */
	materials: {
		material: Material;
		opacity: number;
		transparent: boolean;
		depthWrite: boolean;
	}[];
}

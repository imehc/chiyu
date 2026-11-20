/**
 * 场景层公共类型定义：投影函数、场景上下文与各类标签数据结构。
 * 被 scene/ 下各工厂函数与各屏 world 实现共同引用，保证「场景只传数据、工厂负责渲染」的约定。
 */
import type { Group, Scene, Vector3Like } from "three";
import type Assets from "../assets";
import type { FocusLabelAlign } from "../utils/focus-label";
import type Time from "../utils/time";
import type Label3D from "../world-core/components/label-3d";

/** 经纬度点，顺序固定为 [经度, 纬度] */
export type MapPoint = [number, number];
/**
 * 投影函数：把经纬度转成地图平面坐标。
 * 返回的 y 轴向下为正（与屏幕坐标一致），所以使用处普遍写作 new Vector3(x, -y, z) 翻到 Three.js 的 y 轴向上。
 */
export type ProjectPoint = (point: MapPoint) => MapPoint;
/** 场景工厂共用的运行环境：渲染场景、逐帧时钟与资源加载器 */
export interface SceneContext {
	scene: Scene;
	time: Time;
	assets?: Assets;
}
/** 标签工厂共用的环境：CSS3D 标签创建器、标签父组与投影函数 */
export interface LabelContext {
	label3d: Label3D;
	labelGroup: Group;
	project: ProjectPoint;
}
/** 地图中心主标签（大号中文名 + 英文名）的数据 */
export interface MapFocusLabelInfo {
	name: string;
	enName: string;
	/** 标签锚点的经纬度 */
	center: MapPoint;
	/** 水平对齐方式，默认左对齐 */
	align?: FocusLabelAlign;
}
/** 普通行政区装饰标签 */
export interface DecorationLabel {
	name: string;
	/** 经纬度 [经度, 纬度] */
	center: number[];
	/** 是否加轻微模糊，用于弱化非重点区域 */
	blur?: boolean;
	/** 为 true 时跳过创建，可用来临时隐藏某些区域 */
	hide?: boolean;
}
/** 图标标签（贴图 + 尺寸），reflect 用于控制是否带倒影 */
export interface IconLabel {
	icon: string;
	center: MapPoint;
	/** CSS 宽度，如 "40px" */
	width: string;
	/** CSS 高度，如 "40px" */
	height: string;
	reflect: boolean;
}
/** 柱状图标签业务数据 */
export interface BarLabelData {
	name: string;
	value: number;
	enName: string;
}
/** 监测点标签业务数据 */
export interface MonitoringLabelData {
	name: string;
	value: number;
	/** 等级文案或数值，直接展示在标签里 */
	level: string | number;
	lng: number;
	lat: number;
}
/** 监测点标签的排版参数，单位与场景世界坐标一致 */
export interface MonitoringLabelOptions {
	/** 标签相对地图表面的抬高量 */
	depth: number;
	/** 在 depth 基础上的额外抬升，避免与柱子等元素重叠 */
	verticalOffset: number;
	/** 指标名文案，如「PM2.5」 */
	valueLabel: string;
	/** 指标单位，直接拼在数值后 */
	valueUnit: string;
}
/** 单个柱状图标签的创建参数 */
export interface BarLabelOptions {
	data: BarLabelData;
	/** 排名索引（从 0 开始），决定名次配色 */
	index: number;
	position: Vector3Like;
	/** 数值单位 */
	unit: string;
}

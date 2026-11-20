import type { Group, Scene, Vector3Like } from "three";
import type Assets from "../assets";
import type { FocusLabelAlign } from "../utils/focus-label";
import type Time from "../utils/time";
import type Label3D from "../world-core/components/label-3d";

export type MapPoint = [number, number];
export type ProjectPoint = (point: MapPoint) => MapPoint;
export interface SceneContext {
	scene: Scene;
	time: Time;
	assets?: Assets;
}
export interface LabelContext {
	label3d: Label3D;
	labelGroup: Group;
	project: ProjectPoint;
}
export interface MapFocusLabelInfo {
	name: string;
	enName: string;
	center: MapPoint;
	align?: FocusLabelAlign;
}
export interface DecorationLabel {
	name: string;
	center: number[];
	blur?: boolean;
	hide?: boolean;
}
export interface IconLabel {
	icon: string;
	center: MapPoint;
	width: string;
	height: string;
	reflect: boolean;
}
export interface BarLabelData {
	name: string;
	value: number;
	enName: string;
}
export interface MonitoringLabelData {
	name: string;
	value: number;
	level: string | number;
	lng: number;
	lat: number;
}
export interface MonitoringLabelOptions {
	depth: number;
	verticalOffset: number;
	valueLabel: string;
	valueUnit: string;
}
export interface BarLabelOptions {
	data: BarLabelData;
	index: number;
	position: Vector3Like;
	unit: string;
}

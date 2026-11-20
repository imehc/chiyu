import type { Feature, MultiPolygon, Polygon } from "geojson";
import type gsap from "gsap";
import type { Group, Material, Object3D, Vector2, Vector3 } from "three";

export type Layer =
	| "flyline"
	| "label"
	| "point"
	| "scatter"
	| "heat"
	| "region"
	| "scan";

export type View = "china" | "globe";

export type MapFeature = Feature<Polygon | MultiPolygon>;

export interface MonitoringPoint {
	name: string;
	x: number;
	y: number;
}

export interface BlueWorldCallbacks {
	onRegion?: (name: string) => void;
	onMonitoringPoint?: (point: MonitoringPoint | null) => void;
	onReady?: () => void;
	onViewChange?: (view: View) => void;
	onTransitionChange?: (active: boolean) => void;
	onViewMotionChange?: (phase: "idle" | "exit" | "enter") => void;
	onDrillChange?: (path: string[]) => void;
}

export interface MapCameraPose {
	target: Vector3;
	zoom: number;
	pitch: number;
	yaw: number;
	rotation: number;
	rotationCenter: Vector2;
	topView: boolean;
}

export interface RegionGeometryTransition {
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

export interface ChinaEntranceState {
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

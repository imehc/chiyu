import {
	Group,
	HalfFloatType,
	Line,
	Mesh,
	MeshBasicMaterial,
	type Object3D,
	type PerspectiveCamera,
	PlaneGeometry,
	type Scene,
	Sprite,
	type WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import LayerMotion from "../layer-motion";
import type MapEffects from "../map-effects";
import type ChinaScene from "./china";
import { CHINA_MAP_DEPTH } from "./constants";
import type { RegionGeometryTransition } from "./types";

interface RegionTransitionContext {
	china: ChinaScene;
	scene: Scene;
	camera: PerspectiveCamera;
	renderer: WebGLRenderer;
	mapEffects: MapEffects;
	layerMotion: LayerMotion;
	callbacks: {
		closeMonitoringPoint: () => void;
		setHovered: (mesh: Mesh | undefined) => void;
		isVisible: (object: Object3D) => boolean;
		disposeObject: (object: Object3D) => void;
		getSelectedRegion: () => string | undefined;
		isDestroyed: () => boolean;
		goBack: () => void;
		onLabelsReady: () => void;
	};
}

const smoothProgress = (value: number) => {
	const progress = Math.min(1, Math.max(0, value));
	return progress * progress * (3 - 2 * progress);
};

/** Owns the old and new geometry during a drilldown camera flight. */
export default class RegionTransition {
	readonly reveal = new LayerMotion();
	current: RegionGeometryTransition | undefined;
	pendingBack = false;
	constructor(private readonly context: RegionTransitionContext) {}

	retainOutgoing() {
		this.finish();
		this.context.callbacks.closeMonitoringPoint();
		this.context.callbacks.setHovered(undefined);
		const mapObjects = this.context.china.map.children.filter(
			(object) => object.visible && object !== this.context.mapEffects.group,
		);
		const worldObjects = [
			this.context.china.labels,
			this.context.china.background,
			this.context.china.orbitRing,
			...Object.values(this.context.china.layers),
		].filter((object) => this.context.callbacks.isVisible(object));
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
		this.context.china.map.add(outgoingMap);
		this.context.china.root.add(outgoingWorld);
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
		this.current = {
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
			effectsFromPosition: this.context.mapEffects.group.position.clone(),
			effectsFromScale: this.context.mapEffects.group.scale.clone(),
		};
		for (const group of this.current.outgoing) {
			this.reveal.initialize(group, true);
			this.reveal.preserveDepth(group);
		}
	}

	prepareIncoming(objects: Object3D[], labels: Object3D[], depth: number) {
		const transition = this.current;
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
					object.parent === this.context.china.map ||
					object === this.context.china.labels ||
					Object.values(this.context.china.layers).includes(object as Group),
			)
			.map((object) => ({
				object,
				scaleZ: object.scale.z,
				positionZ: object.position.z,
			}));
		for (const object of objects) {
			this.reveal.initialize(object, true);
			this.reveal.preserveDepth(object);
		}
		for (const label of labels) this.reveal.setProgress(label, 0);
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ * transition.depthRatio;
			if (object.parent === this.context.china.map)
				object.position.z = positionZ + transition.depthOffset;
		}
		transition.effectsToPosition =
			this.context.mapEffects.group.position.clone();
		transition.effectsToScale = this.context.mapEffects.group.scale.clone();
		this.context.mapEffects.group.position.copy(transition.effectsFromPosition);
		this.context.mapEffects.group.scale.copy(transition.effectsFromScale);
		this.context.mapEffects.cancelExit();
		this.context.callbacks.onLabelsReady();
		this.context.layerMotion.update();
		// Prepare shaders and label textures before the flight begins.
		for (const root of objects) {
			root.traverse((object) => {
				if (!(object instanceof Mesh || object instanceof Sprite)) return;
				const materials = Array.isArray(object.material)
					? object.material
					: [object.material];
				for (const material of materials) {
					const texture = (material as MeshBasicMaterial).map;
					if (texture) this.context.renderer.initTexture(texture);
				}
			});
		}
		this.context.renderer.compile(this.context.scene, this.context.camera);
		const previousTarget = this.context.renderer.getRenderTarget();
		const warmTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
		try {
			this.context.renderer.setRenderTarget(warmTarget);
			this.context.renderer.render(this.context.scene, this.context.camera);
		} finally {
			this.context.renderer.setRenderTarget(previousTarget);
			warmTarget.dispose();
		}
		for (const object of objects) this.reveal.setProgress(object, 0);
	}

	finish(runPending = false) {
		const transition = this.current;
		if (!transition) return;
		this.current = undefined;
		for (const { group, order } of transition.groupOrders)
			group.renderOrder = order;
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ;
			object.position.z = positionZ;
		}
		for (const root of [...transition.outgoing, ...transition.incoming])
			this.reveal.forget(root);
		for (const { object, visible } of transition.outgoingAccents) {
			if (!object.userData.blueLayer) object.visible = visible;
		}
		for (const { object, parent } of transition.saved) {
			if (transition.retired.has(object)) {
				this.context.callbacks.disposeObject(object as Group);
				object.removeFromParent();
				continue;
			}
			parent.add(object);
			if (
				parent === this.context.china.map ||
				object === this.context.china.labels ||
				object === this.context.china.background ||
				object === this.context.china.orbitRing
			)
				object.visible = !this.context.callbacks.getSelectedRegion();
			if (
				Object.values(this.context.china.layers).includes(object as Group) &&
				this.context.callbacks.getSelectedRegion()
			)
				object.removeFromParent();
		}
		for (const root of transition.outgoing) {
			this.context.callbacks.disposeObject(root);
			root.removeFromParent();
		}
		if (transition.effectsToPosition)
			this.context.mapEffects.group.position.copy(transition.effectsToPosition);
		if (transition.effectsToScale)
			this.context.mapEffects.group.scale.copy(transition.effectsToScale);
		const goBack = this.pendingBack;
		this.pendingBack = false;
		if (runPending && goBack && !this.context.callbacks.isDestroyed())
			this.context.callbacks.goBack();
	}

	advance(
		transition: RegionGeometryTransition,
		time: number,
		progress: number,
	) {
		transition.progress = time;
		const reveal = smoothProgress((time - 0.28) / 0.68);
		for (const root of transition.outgoing)
			this.reveal.setProgress(root, 1 - reveal);
		for (const { object } of transition.outgoingAccents)
			this.reveal.setProgress(object, 1 - smoothProgress((time - 0.05) / 0.57));
		for (const root of transition.incoming)
			this.reveal.setProgress(root, smoothProgress((time - 0.08) / 0.68));
		for (const root of transition.incomingLabels)
			this.reveal.setProgress(root, smoothProgress((time - 0.18) / 0.72));
		const depthScale = transition.depthRatio ** (1 - progress);
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ * depthScale;
			if (object.parent === this.context.china.map)
				object.position.z = positionZ + transition.depthOffset * (1 - progress);
		}
		if (transition.effectsToPosition)
			this.context.mapEffects.group.position.lerpVectors(
				transition.effectsFromPosition,
				transition.effectsToPosition,
				progress,
			);
		if (transition.effectsToScale)
			this.context.mapEffects.group.scale.lerpVectors(
				transition.effectsFromScale,
				transition.effectsToScale,
				progress,
			);
	}
}

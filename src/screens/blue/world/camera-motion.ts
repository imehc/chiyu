import gsap from "gsap";
import { Line, type Material, Mesh, Vector2, type Vector3 } from "three";
import {
	CHINA_ENTRANCE_DELAY,
	GLOBE_HOME,
	REGION_TRANSITION_DURATION,
} from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { ChinaEntranceState, MapCameraPose, View } from "./types";

interface CameraMotionContext {
	state: Pick<
		WorldState,
		| "angleTween"
		| "callbacks"
		| "cameraPitch"
		| "cameraYaw"
		| "chinaEntrance"
		| "chinaScene"
		| "detailHomeTarget"
		| "geometry"
		| "globeLabelOpacity"
		| "globeScene"
		| "labelTween"
		| "mapEffects"
		| "mapLabelOpacity"
		| "mapRotation"
		| "mapRotationCenter"
		| "reducedMotion"
		| "regionGeometry"
		| "selectedRegion"
		| "switchingView"
		| "target"
		| "transitionTimeline"
		| "view"
		| "viewEntranceActive"
		| "zoomLevel"
		| "zoomTarget"
		| "zoomTween"
	>;
	controllers: () => Pick<WorldControllers, "camera" | "frame">;
}

export default class CameraMotion {
	constructor(private readonly context: CameraMotionContext) {}

	playChinaEntrance() {
		this.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.labelTween?.kill();
		this.context.state.mapLabelOpacity = 0;
		if (this.context.state.reducedMotion.matches) {
			this.context.state.zoomLevel = 1;
			this.context.state.cameraPitch = 0.72;
			this.context.state.cameraYaw = 0;
			this.context.controllers().camera.updateCamera();
			this.context.state.mapEffects.restartEntrance();
			this.context.controllers().frame.revealMapNames();
			return;
		}
		const objects = this.context.state.chinaScene.map.children
			.filter((object) => object !== this.context.state.mapEffects.group)
			.map((object) => ({
				object,
				scaleZ: object.scale.z,
				positionZ: object.position.z,
			}));
		const uniqueMaterials = new Set<Material>();
		for (const { object } of objects) {
			object.traverse((child) => {
				if (!(child instanceof Mesh || child instanceof Line)) return;
				for (const material of Array.isArray(child.material)
					? child.material
					: [child.material])
					uniqueMaterials.add(material);
			});
		}
		const materials = [...uniqueMaterials].map((material) => ({
			material,
			opacity: material.opacity,
			transparent: material.transparent,
			depthWrite: material.depthWrite,
		}));
		const entrance: ChinaEntranceState = { objects, materials };
		this.context.state.chinaEntrance = entrance;
		this.context.state.geometry.bodyReveal.value = 0;
		for (const { object, positionZ } of objects) {
			object.scale.z = 0;
			object.position.z = positionZ - 0.01;
		}
		for (const { material } of materials) {
			material.opacity = 0;
			material.transparent = true;
			material.depthWrite = false;
			material.needsUpdate = true;
		}
		// Match Chongqing's distant, low view from the left at any viewport size.
		this.context.state.zoomLevel = 0.568;
		this.context.state.cameraPitch = 0.3;
		this.context.state.cameraYaw = -0.337;
		this.context.controllers().camera.updateCamera();
		this.context.state.mapEffects.restartEntrance(
			CHINA_ENTRANCE_DELAY + 3 + 0.25,
		);
		const timeline = gsap.timeline({
			delay: CHINA_ENTRANCE_DELAY,
			onComplete: () => {
				this.restoreChinaEntrance();
				this.context.controllers().camera.updateCamera();
				this.context.state.mapEffects.restartEntrance(0.25);
				this.context.controllers().frame.revealMapNames();
			},
		});
		entrance.timeline = timeline;
		this.context.state.transitionTimeline = timeline;
		timeline.to(
			this.context.state,
			{
				zoomLevel: 1,
				cameraPitch: 0.72,
				cameraYaw: 0,
				duration: 2,
				ease: "circ.out",
				onUpdate: () => this.context.controllers().camera.updateCamera(),
			},
			0,
		);
		for (const { object, scaleZ, positionZ } of objects) {
			timeline.to(
				object.scale,
				{ z: scaleZ, duration: 1, ease: "circ.out" },
				1.5,
			);
			timeline.to(object.position, { z: positionZ, duration: 1 }, 1.5);
		}
		timeline.to(
			this.context.state.geometry.bodyReveal,
			{ value: 1, duration: 1, ease: "circ.out" },
			2,
		);
		for (const { material, opacity } of materials)
			timeline.to(material, { opacity, duration: 1, ease: "circ.out" }, 2);
	}

	restoreChinaEntrance() {
		const entrance = this.context.state.chinaEntrance;
		if (!entrance) return;
		entrance.timeline?.kill();
		this.context.state.chinaEntrance = undefined;
		this.context.state.geometry.bodyReveal.value = 1;
		this.context.state.cameraYaw = 0;
		for (const { object, scaleZ, positionZ } of entrance.objects) {
			object.scale.z = scaleZ;
			object.position.z = positionZ;
		}
		for (const {
			material,
			opacity,
			transparent,
			depthWrite,
		} of entrance.materials) {
			material.opacity = opacity;
			material.transparent = transparent;
			material.depthWrite = depthWrite;
			material.needsUpdate = true;
		}
		this.context.controllers().camera.updateCamera();
	}

	stopViewEntrance() {
		if (this.context.state.viewEntranceActive) {
			this.context.state.transitionTimeline?.kill();
			this.context.state.viewEntranceActive = false;
			this.context.state.chinaScene.root.scale.setScalar(1);
			if (!this.context.state.switchingView)
				this.context.state.callbacks.onViewMotionChange?.("idle");
		}
	}

	stopCameraControls() {
		this.restoreChinaEntrance();
		this.stopViewEntrance();
		this.context.state.zoomTween?.kill();
		this.context.state.angleTween?.kill();
		this.context.state.zoomTween = undefined;
		this.context.state.angleTween = undefined;
		this.context.state.zoomTarget = undefined;
	}

	prepareViewEntrance(view: View) {
		// Switching uses a restrained reveal; the original first-load flight stays separate.
		this.context.state.zoomLevel = view === "globe" ? 1 : 0.97;
		this.context.state.cameraPitch = 0.76;
		this.context.state.cameraYaw = 0;
		this.context.state.mapLabelOpacity = view === "china" ? 0.25 : 0;
		this.context.state.globeLabelOpacity = view === "globe" ? 0.3 : 0;
		if (view === "china") this.context.state.chinaScene.root.scale.y = 0.96;
		else if (this.context.state.globeScene.mesh)
			this.context.state.globeScene.mesh.rotation.y = GLOBE_HOME.y - 0.06;
		this.context.controllers().camera.updateCamera();
		this.context.state.viewEntranceActive = true;
		const timeline = gsap.timeline({
			paused: true,
			onComplete: () => {
				this.context.state.viewEntranceActive = false;
				this.context.state.chinaScene.root.scale.setScalar(1);
				this.context.state.callbacks.onViewMotionChange?.("idle");
				this.context.controllers().frame.revealMapNames();
			},
		});
		this.context.state.transitionTimeline = timeline;
		const dolly = { distance: 1 / this.context.state.zoomLevel };
		timeline.to(
			dolly,
			{
				distance: 1,
				duration: 1.65,
				ease: "sine.inOut",
				onUpdate: () => {
					this.context.state.zoomLevel = 1 / dolly.distance;
					this.context.controllers().camera.updateCamera();
				},
			},
			0,
		);
		timeline.to(
			this.context.state,
			{
				cameraPitch: 0.72,
				duration: 1.65,
				ease: "sine.inOut",
				onUpdate: () => this.context.controllers().camera.updateCamera(),
			},
			0,
		);
		timeline.to(
			this.context.state,
			{
				mapLabelOpacity: view === "china" ? 1 : 0,
				globeLabelOpacity: view === "globe" ? 1 : 0,
				duration: 1.1,
				ease: "sine.inOut",
			},
			0.35,
		);
		if (view === "china")
			timeline.to(
				this.context.state.chinaScene.root.scale,
				{ y: 1, duration: 1.65, ease: "sine.inOut" },
				0,
			);
		else if (this.context.state.globeScene.mesh)
			timeline.to(
				this.context.state.globeScene.mesh.rotation,
				{ ...GLOBE_HOME, duration: 1.65, ease: "sine.inOut" },
				0,
			);
		// The last staggered side button settles at 1.9s; breathing resumes afterward.
		timeline.call(
			() => this.context.controllers().frame.revealMapNames(),
			[],
			2,
		);
	}

	transitionRegionCamera(
		target: Vector3,
		zoom: number,
		returnPose?: MapCameraPose,
	) {
		this.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.labelTween?.kill();
		const from = this.context.controllers().camera.getMapCameraPose();
		const destination: MapCameraPose = returnPose ?? {
			target: target.clone(),
			zoom,
			pitch: 0.72,
			yaw: 0,
			rotation: 0,
			rotationCenter: this.context.state.selectedRegion
				? new Vector2(
						this.context.state.detailHomeTarget.x,
						-this.context.state.detailHomeTarget.z,
					)
				: new Vector2(),
			topView: false,
		};
		const angleDelta = (start: number, end: number) => {
			const turn = Math.PI * 2;
			return ((((end - start + Math.PI) % turn) + turn) % turn) - Math.PI;
		};
		const yawDelta = angleDelta(from.yaw, destination.yaw);
		const rotationDelta = angleDelta(from.rotation, destination.rotation);
		const transition = this.context.state.regionGeometry.current;
		const motion = { progress: 0 };
		const update = () => {
			const time = motion.progress;
			// Zero velocity and acceleration at both ends keeps the last frames
			// settling into the same live geometry rather than revealing a replacement.
			const progress = time * time * time * (time * (time * 6 - 15) + 10);
			// Interpolate zoom by ratio so both inward and outward flights have
			// the same visual pace, with no separate pause at the map replacement.
			this.context.state.zoomLevel =
				from.zoom * (destination.zoom / from.zoom) ** progress;
			this.context.state.target.lerpVectors(
				from.target,
				destination.target,
				progress,
			);
			this.context.state.cameraPitch =
				from.pitch + (destination.pitch - from.pitch) * progress;
			this.context.state.cameraYaw = from.yaw + yawDelta * progress;
			this.context.state.mapRotation = from.rotation + rotationDelta * progress;
			this.context.state.mapRotationCenter.lerpVectors(
				from.rotationCenter,
				destination.rotationCenter,
				progress,
			);
			if (transition) {
				this.context.state.regionGeometry.advance(transition, time, progress);
			}
			this.context.controllers().camera.updateMapRotation();
			this.context.controllers().camera.updateCamera();
		};
		const timeline = gsap.timeline({
			onComplete: () => {
				this.context.controllers().camera.restoreMapCameraPose(destination);
				this.context.state.mapLabelOpacity = 1;
				this.context.state.regionGeometry.finish(true);
			},
		});
		this.context.state.transitionTimeline = timeline;
		update();
		timeline.to(motion, {
			progress: 1,
			duration: this.context.state.reducedMotion.matches
				? 0
				: REGION_TRANSITION_DURATION,
			ease: "none",
			onUpdate: update,
		});
	}

	transitionCamera(target: Vector3, zoom: number, duration = 1.25, delay = 0) {
		if (this.context.state.reducedMotion.matches) duration = delay = 0;
		this.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.labelTween?.kill();
		if (this.context.state.view === "china") {
			this.context.state.mapLabelOpacity = 0;
			this.context.state.mapEffects.restartEntrance(duration + delay + 0.25);
		}
		const timeline = gsap.timeline({
			delay,
			onComplete: () => this.context.controllers().frame.revealMapNames(),
		});
		this.context.state.transitionTimeline = timeline;
		const dolly = { distance: 1 / this.context.state.zoomLevel };
		timeline.to(
			dolly,
			{
				distance: 1 / zoom,
				duration,
				ease: "power2.inOut",
				onUpdate: () => {
					this.context.state.zoomLevel = 1 / dolly.distance;
					this.context.controllers().camera.updateCamera();
				},
			},
			0,
		);
		timeline.to(
			this.context.state.target,
			{
				x: target.x,
				y: target.y,
				z: target.z,
				duration,
				ease: "power2.inOut",
				onUpdate: () => this.context.controllers().camera.updateCamera(),
			},
			0,
		);
		timeline.to(
			this.context.state,
			{
				mapRotation: 0,
				...(this.context.state.view === "china"
					? { cameraPitch: 0.72, cameraYaw: 0 }
					: {}),
				duration,
				ease: "power2.inOut",
				onUpdate: () => {
					this.context.controllers().camera.updateMapRotation();
					this.context.controllers().camera.updateCamera();
				},
			},
			0,
		);
	}
}

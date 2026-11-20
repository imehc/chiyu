import gsap from "gsap";
import type { Mesh, ShaderMaterial, Sprite } from "three";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";

interface WorldInteractionContext {
	state: Pick<
		WorldState,
		| "activeMonitoringMarker"
		| "callbacks"
		| "camera"
		| "cameraPitch"
		| "canvas"
		| "chinaScene"
		| "detailLoading"
		| "detailMeshes"
		| "dragStart"
		| "drillPath"
		| "globeScene"
		| "hoverMesh"
		| "mapRotation"
		| "monitoringOffset"
		| "monitoringPosition"
		| "monitoringProjection"
		| "monitoringScale"
		| "pointer"
		| "raycaster"
		| "regionGeometry"
		| "scene"
		| "selectedRegion"
		| "switchingView"
		| "topView"
		| "transitionTimeline"
		| "view"
	>;
	controllers: () => Pick<
		WorldControllers,
		"camera" | "cameraMotion" | "frame"
	>;
}

export default class WorldInteraction {
	constructor(private readonly context: WorldInteractionContext) {}

	updateMonitoringPoint() {
		const marker = this.context.state.activeMonitoringMarker;
		if (!marker) return;
		if (this.context.state.view !== "china" || !this.isVisible(marker)) {
			this.closeMonitoringPoint();
			return;
		}
		marker.getWorldScale(this.context.state.monitoringScale);
		this.context.state.monitoringOffset
			.set(0, 1, 0)
			.applyQuaternion(this.context.state.camera.quaternion)
			.multiplyScalar(
				this.context.state.monitoringScale.y * (1 - marker.center.y),
			);
		marker
			.getWorldPosition(this.context.state.monitoringProjection)
			.add(this.context.state.monitoringOffset)
			.project(this.context.state.camera);
		const { x, y, z } = this.context.state.monitoringProjection;
		if (z < -1 || z > 1 || Math.abs(x) > 1 || Math.abs(y) > 1) {
			this.closeMonitoringPoint();
			return;
		}
		const position = {
			name: marker.userData.name as string,
			x: ((x + 1) / 2) * this.context.state.canvas.clientWidth,
			y: ((1 - y) / 2) * this.context.state.canvas.clientHeight - 4,
		};
		if (
			!this.context.state.monitoringPosition ||
			Math.abs(position.x - this.context.state.monitoringPosition.x) > 0.1 ||
			Math.abs(position.y - this.context.state.monitoringPosition.y) > 0.1
		) {
			this.context.state.monitoringPosition = position;
			this.context.state.callbacks.onMonitoringPoint?.(position);
		}
	}

	closeMonitoringPoint() {
		if (!this.context.state.activeMonitoringMarker) return;
		this.context.state.activeMonitoringMarker = undefined;
		this.context.state.monitoringPosition = undefined;
		this.context.state.callbacks.onMonitoringPoint?.(null);
	}

	intersectRegion(event: PointerEvent) {
		const rect = this.context.state.canvas.getBoundingClientRect();
		this.context.state.pointer.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1,
		);
		this.context.state.raycaster.setFromCamera(
			this.context.state.pointer,
			this.context.state.camera,
		);
		return this.context.state.raycaster.intersectObjects(
			(this.context.state.drillPath.length
				? this.context.state.detailMeshes
				: this.context.state.chinaScene.regionMeshes
			).filter((mesh) => this.isVisible(mesh)),
			false,
		)[0]?.object as Mesh | undefined;
	}

	setHovered(mesh: Mesh | undefined) {
		if (this.context.state.hoverMesh === mesh) return;
		if (this.context.state.hoverMesh)
			gsap.to(
				(this.context.state.hoverMesh.userData.top as ShaderMaterial).uniforms
					.hovered,
				{ value: 0, duration: 0.2, overwrite: true },
			);
		this.context.state.hoverMesh = mesh;
		if (mesh)
			gsap.to((mesh.userData.top as ShaderMaterial).uniforms.hovered, {
				value: 1,
				duration: 0.16,
				overwrite: true,
			});
		this.context.state.canvas.style.cursor = mesh ? "pointer" : "default";
	}

	onPointerMove = (event: PointerEvent) => {
		if (
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		if (this.context.state.dragStart) {
			const dx = event.clientX - this.context.state.dragStart.x;
			const dy = event.clientY - this.context.state.dragStart.y;
			if (Math.hypot(dx, dy) > 5) this.context.state.dragStart.moved = true;
			if (
				this.context.state.view === "globe" &&
				this.context.state.globeScene.mesh
			) {
				if (this.context.state.dragStart.moved)
					this.context.state.topView = false;
				this.context.state.globeScene.mesh.rotation.y += dx * 0.005;
				this.context.state.globeScene.mesh.rotation.x += dy * 0.005;
			} else if (
				this.context.state.view === "china" &&
				this.context.state.dragStart.moved
			) {
				this.context.state.mapRotation += dx * 0.005;
				this.context.state.cameraPitch = Math.max(
					0.38,
					Math.min(1.5, this.context.state.cameraPitch + dy * 0.004),
				);
				this.context.state.topView = false;
				this.context.controllers().camera.updateMapRotation();
				this.context.controllers().camera.updateCamera();
			}
			if (this.context.state.dragStart.moved) {
				this.context.state.dragStart.x = event.clientX;
				this.context.state.dragStart.y = event.clientY;
			}
		}
		if (
			this.context.state.view === "china" &&
			!this.context.state.detailLoading
		)
			this.setHovered(this.intersectRegion(event));
	};

	onPointerDown = (event: PointerEvent) => {
		if (
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.dragStart = {
			x: event.clientX,
			y: event.clientY,
			moved: false,
		};
	};

	onPointerUp = (event: PointerEvent) => {
		if (
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		const moved = this.context.state.dragStart?.moved;
		this.context.state.dragStart = undefined;
		this.context.controllers().frame.revealMapNames();
		if (!moved && this.context.state.view === "china") {
			this.intersectRegion(event);
			if (
				this.context.state.chinaScene.layers.point.visible ||
				this.context.state.chinaScene.layers.label.visible ||
				this.context.state.selectedRegion
			) {
				const marker = this.context.state.raycaster.intersectObjects(
					this.context.state.chinaScene.monitoringMarkers.filter((marker) =>
						this.isVisible(marker),
					),
					false,
				)[0]?.object;
				if (marker) {
					if (marker === this.context.state.activeMonitoringMarker) {
						this.closeMonitoringPoint();
					} else {
						this.context.state.activeMonitoringMarker = marker as Sprite;
						this.context.state.monitoringPosition = undefined;
						this.updateMonitoringPoint();
					}
					return;
				}
			}
			this.closeMonitoringPoint();
			if (!this.context.state.detailLoading) {
				const mesh = this.intersectRegion(event);
				if (mesh)
					this.context.state.callbacks.onRegion?.(mesh.userData.name as string);
			}
		}
	};

	onPointerLeave = () => {
		this.context.state.dragStart = undefined;
		this.setHovered(undefined);
		this.context.controllers().frame.revealMapNames();
	};

	onWheel = (event: WheelEvent) => {
		event.preventDefault();
		this.context.controllers().camera.zoom(event.deltaY > 0 ? 0.92 : 1.08);
	};

	isVisible(object: import("three").Object3D) {
		let current: import("three").Object3D | null = object;
		while (current) {
			if (!current.visible) return false;
			if (current === this.context.state.scene) return true;
			current = current.parent;
		}
		return false;
	}
}

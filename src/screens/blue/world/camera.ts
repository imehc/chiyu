import gsap from "gsap";
import { type Mesh, Vector3 } from "three";
import { GLOBE_SCAN_RADIUS } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { MapCameraPose } from "./types";

interface WorldCameraContext {
	state: Pick<
		WorldState,
		| "angleTween"
		| "camera"
		| "cameraDistance"
		| "cameraPitch"
		| "cameraYaw"
		| "canvas"
		| "chinaScene"
		| "composer"
		| "destroyed"
		| "detailZoom"
		| "geometry"
		| "globeScene"
		| "mapRotation"
		| "mapRotationCenter"
		| "ready"
		| "reducedMotion"
		| "regionGeometry"
		| "renderer"
		| "selectedRegion"
		| "switchingView"
		| "target"
		| "topView"
		| "transitionTimeline"
		| "view"
		| "viewMix"
		| "zoomLevel"
		| "zoomTarget"
		| "zoomTween"
	>;
	controllers: () => Pick<WorldControllers, "cameraMotion" | "frame">;
}

export default class WorldCamera {
	constructor(private readonly context: WorldCameraContext) {}

	resize = () => {
		const bounds = this.context.state.canvas.getBoundingClientRect();
		const width = Math.max(Math.round(bounds.width), 1);
		const height = Math.max(Math.round(bounds.height), 1);
		const pixelRatio = Math.min(window.devicePixelRatio, 2);
		if (this.context.state.renderer.getPixelRatio() !== pixelRatio) {
			this.context.state.renderer.setPixelRatio(pixelRatio);
			this.context.state.composer.setPixelRatio(pixelRatio);
		}
		this.context.state.renderer.setSize(width, height, false);
		this.context.state.renderer.getDrawingBufferSize(
			this.context.state.geometry.contextViewport,
		);
		this.context.state.composer.setSize(width, height);
		this.context.state.camera.aspect = width / height;
		this.context.state.camera.updateProjectionMatrix();
		// China spans ~15 map units and 40% of the source video width.
		this.context.state.cameraDistance =
			15.3 /
			(0.4212 *
				this.context.state.camera.aspect *
				2 *
				Math.tan((36 * Math.PI) / 360));
		this.updateCamera();
	};

	globeCameraDistance() {
		const diameterFraction = Math.min(
			0.73,
			this.context.state.camera.aspect * 0.36,
		);
		const tangent = Math.tan((36 * Math.PI) / 360) * diameterFraction;
		return 5.1 * Math.sqrt(1 + 1 / tangent ** 2);
	}

	updateCamera() {
		const globeDistance = this.globeCameraDistance();
		const chinaDistance =
			this.context.state.cameraDistance / this.context.state.zoomLevel;
		const distance =
			chinaDistance * (1 - this.context.state.viewMix) +
			(globeDistance / this.context.state.zoomLevel) *
				this.context.state.viewMix;
		const pitch = this.context.state.cameraPitch;
		const horizontalDistance = chinaDistance * Math.cos(pitch);
		this.context.state.camera.position.set(
			(this.context.state.target.x +
				horizontalDistance * Math.sin(this.context.state.cameraYaw)) *
				(1 - this.context.state.viewMix),
			(this.context.state.target.y + chinaDistance * Math.sin(pitch)) *
				(1 - this.context.state.viewMix) +
				0.5 * this.context.state.viewMix,
			(this.context.state.target.z +
				horizontalDistance * Math.cos(this.context.state.cameraYaw)) *
				(1 - this.context.state.viewMix) +
				(globeDistance / this.context.state.zoomLevel) *
					this.context.state.viewMix,
		);
		this.context.state.camera.near = Math.min(0.1, distance * 0.05);
		this.context.state.camera.lookAt(this.context.state.target);
		this.context.state.camera.updateProjectionMatrix();
		if (this.context.state.globeScene.radiance) {
			const distance = this.context.state.camera.position.length();
			// Match the projected silhouette of the scan sphere at every zoom level.
			const radius =
				(GLOBE_SCAN_RADIUS * distance) /
				Math.sqrt(Math.max(distance ** 2 - GLOBE_SCAN_RADIUS ** 2, 0.01));
			this.context.state.globeScene.radiance.scale.set(
				radius * 2,
				radius * 2,
				1,
			);
		}
	}

	getMapCameraPose(): MapCameraPose {
		return {
			target: this.context.state.target.clone(),
			zoom: this.context.state.zoomLevel,
			pitch: this.context.state.cameraPitch,
			yaw: this.context.state.cameraYaw,
			rotation: this.context.state.mapRotation,
			rotationCenter: this.context.state.mapRotationCenter.clone(),
			topView: this.context.state.topView,
		};
	}

	restoreMapCameraPose(pose: MapCameraPose) {
		this.context.state.target.copy(pose.target);
		this.context.state.zoomLevel = pose.zoom;
		this.context.state.cameraPitch = pose.pitch;
		this.context.state.cameraYaw = pose.yaw;
		this.context.state.mapRotation = pose.rotation;
		this.context.state.mapRotationCenter.copy(pose.rotationCenter);
		this.context.state.topView = pose.topView;
		this.updateMapRotation();
		this.updateCamera();
	}

	fitRegionZoom(
		mesh: Mesh,
		target: Vector3,
		spatialScale: number,
		span: number,
	) {
		const positions = mesh.geometry.getAttribute("position");
		const point = new Vector3();
		const pitch = this.context.state.cameraPitch;
		const leaf = Number(mesh.userData.feature?.properties?.childrenNum) === 0;
		let lower = 0;
		let upper = 14 / span;
		// Fit the actual silhouette into the central display, including its raised surface.
		for (let step = 0; step < 20; step++) {
			const zoom = (lower + upper) / 2;
			const distance = this.context.state.cameraDistance / zoom;
			this.context.state.camera.position.set(
				target.x,
				target.y + distance * Math.sin(pitch),
				target.z + distance * Math.cos(pitch),
			);
			this.context.state.camera.lookAt(target);
			this.context.state.camera.updateMatrixWorld();
			let fits = true;
			for (let index = 0; index < positions.count; index++) {
				const height = positions.getZ(index);
				point
					.set(
						positions.getX(index),
						this.context.state.chinaScene.map.position.y +
							(height + (height > 0 ? 0.025 : 0)) * spatialScale,
						-positions.getY(index),
					)
					.project(this.context.state.camera);
				if (
					Math.abs(point.x) > (leaf ? 0.27 : 0.4) ||
					point.y > (leaf ? 0.4 : 0.52) ||
					point.y < (leaf ? -0.6 : -0.72)
				) {
					fits = false;
					break;
				}
			}
			if (fits) lower = zoom;
			else upper = zoom;
		}
		this.updateCamera();
		return Math.max(0.25, lower);
	}

	zoom(factor: number) {
		if (
			this.context.state.destroyed ||
			!this.context.state.ready ||
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		this.context.controllers().cameraMotion.restoreChinaEntrance();
		this.context.controllers().cameraMotion.stopViewEntrance();
		this.context.state.transitionTimeline?.kill();
		const baseline = this.context.state.selectedRegion
			? this.context.state.detailZoom
			: 1;
		const nextZoom = Math.max(
			0.48 * baseline,
			Math.min(
				2.6 * baseline,
				(this.context.state.zoomTarget ?? this.context.state.zoomLevel) *
					factor,
			),
		);
		this.context.state.zoomTween?.kill();
		this.context.state.zoomTarget = nextZoom;
		this.context.state.zoomTween = gsap.to(this.context.state, {
			zoomLevel: nextZoom,
			duration: this.context.state.reducedMotion.matches ? 0 : 0.42,
			ease: "power2.out",
			onUpdate: () => this.updateCamera(),
			onComplete: () => {
				this.context.state.zoomTarget = undefined;
				this.context.state.zoomTween = undefined;
				this.context.controllers().frame.revealMapNames();
			},
		});
	}

	setTopView() {
		if (
			this.context.state.destroyed ||
			!this.context.state.ready ||
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		this.context.controllers().cameraMotion.restoreChinaEntrance();
		this.context.controllers().cameraMotion.stopViewEntrance();
		this.context.state.transitionTimeline?.kill();
		this.context.state.angleTween?.kill();
		this.context.state.topView = true;
		const options = {
			duration: this.context.state.reducedMotion.matches ? 0 : 0.85,
			ease: "power2.inOut",
			onUpdate: () => this.updateCamera(),
			onComplete: () => {
				this.context.state.angleTween = undefined;
				this.context.controllers().frame.revealMapNames();
			},
		};
		if (
			this.context.state.view === "globe" &&
			this.context.state.globeScene.mesh
		) {
			this.context.state.angleTween = gsap.to(
				this.context.state.globeScene.mesh.rotation,
				{
					x:
						Math.PI / 2 -
						Math.atan2(
							this.context.state.camera.position.y -
								this.context.state.target.y,
							this.context.state.camera.position.z -
								this.context.state.target.z,
						),
					z: 0,
					...options,
				},
			);
		} else {
			this.context.state.angleTween = gsap.to(this.context.state, {
				cameraPitch: Math.PI / 2,
				...options,
			});
		}
	}

	updateMapRotation() {
		const { x, y } = this.context.state.mapRotationCenter;
		const cosine = Math.cos(this.context.state.mapRotation),
			sine = Math.sin(this.context.state.mapRotation);
		// Keep the current region under the camera while rotating its geographic plane.
		this.context.state.chinaScene.map.position.x = x - (x * cosine - y * sine);
		this.context.state.chinaScene.map.position.z = -y + (x * sine + y * cosine);
		this.context.state.chinaScene.surrounding.rotation.z =
			this.context.state.mapRotation;
		this.context.state.chinaScene.surrounding.position.x =
			this.context.state.chinaScene.map.position.x;
		this.context.state.chinaScene.surrounding.position.z =
			this.context.state.chinaScene.map.position.z;
		this.context.state.chinaScene.map.rotation.z =
			this.context.state.mapRotation;
		this.context.state.chinaScene.labels.rotation.z =
			this.context.state.mapRotation;
		Object.values(this.context.state.chinaScene.layers).forEach((group) => {
			group.rotation.z = this.context.state.mapRotation;
		});
	}
}

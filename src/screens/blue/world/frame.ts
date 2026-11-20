import gsap from "gsap";
import { type MeshBasicMaterial, Sprite, type Vector3 } from "three";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";

interface WorldFrameContext {
	state: Pick<
		WorldState,
		| "angleTween"
		| "animationFrame"
		| "camera"
		| "cameraPitch"
		| "chinaScene"
		| "cloudTransition"
		| "composer"
		| "destroyed"
		| "detailLoading"
		| "detailTimeline"
		| "dragStart"
		| "drilledLabels"
		| "geometry"
		| "globeLabelOpacity"
		| "globeScene"
		| "labelTween"
		| "layerMotion"
		| "mapEffects"
		| "mapLabelOpacity"
		| "mapLabels"
		| "overlays"
		| "previousFrameTime"
		| "reducedMotion"
		| "regionGeometry"
		| "renderer"
		| "selectedRegion"
		| "started"
		| "switchingView"
		| "topView"
		| "transitionTimeline"
		| "view"
	>;
	controllers: () => Pick<WorldControllers, "interaction">;
}

export default class WorldFrame {
	constructor(private readonly context: WorldFrameContext) {}

	mapName(
		name: string,
		position: Vector3,
		leaf = false,
		pixels = leaf ? 16 : 14,
		variant: "region" | "context" = "region",
	) {
		return this.context.state.mapLabels.create(
			name,
			position,
			leaf,
			pixels,
			variant,
			this.context.state.selectedRegion
				? this.context.state.mapEffects.group.scale.x
				: 1,
		);
	}

	revealMapNames() {
		if (
			this.context.state.mapLabelOpacity >= 1 ||
			this.context.state.view !== "china" ||
			this.context.state.switchingView ||
			this.context.state.detailLoading ||
			this.context.state.transitionTimeline?.isActive() ||
			this.context.state.detailTimeline?.isActive()
		)
			return;
		this.context.state.labelTween?.kill();
		this.context.state.labelTween = gsap.to(this.context.state, {
			mapLabelOpacity: 1,
			duration: this.context.state.reducedMotion.matches ? 0 : 0.95,
			delay:
				this.context.state.reducedMotion.matches ||
				this.context.state.mapLabelOpacity > 0
					? 0
					: 0.2,
			ease: "power2.out",
		});
	}

	updateMapNames() {
		for (const label of this.context.state.mapLabels.surfaceLabels) {
			if (this.context.state.regionGeometry.current?.frozenLabels.has(label))
				continue;
			const { variant, surfaceHeight, riseDepth } = label.userData.mapName;
			let layerReveal = 1;
			for (let parent = label.parent; parent; parent = parent.parent) {
				if (
					parent === this.context.state.drilledLabels ||
					parent === this.context.state.chinaScene.layers.label
				) {
					layerReveal = this.context.state.layerMotion.getProgress(parent);
					break;
				}
			}
			if (variant === "context") {
				label.position.z =
					surfaceHeight -
					riseDepth * (1 - this.context.state.mapLabelOpacity) -
					riseDepth * 0.07 * (1 - layerReveal);
			} else {
				label.position.z =
					surfaceHeight - riseDepth * 0.045 * (1 - layerReveal);
			}
			label.material.opacity =
				this.context.state.mapLabelOpacity *
				(label.userData.mapName.reveal?.value ?? 1) *
				(variant === "context" ? 0.92 : 0.88);
		}
		for (const group of [
			this.context.state.chinaScene.layers.label,
			this.context.state.drilledLabels,
			this.context.state.chinaScene.labels,
		]) {
			if (!group || !this.context.controllers().interaction.isVisible(group))
				continue;
			for (const child of group.children) {
				if (!(child instanceof Sprite) || child.userData.mapName) continue;
				if (this.context.state.regionGeometry.current?.frozenLabels.has(child))
					continue;
				child.material.userData.referenceOpacity ??= child.material.opacity;
				child.material.opacity =
					child.material.userData.referenceOpacity *
					this.context.state.mapLabelOpacity;
			}
		}
	}

	animate = () => {
		if (this.context.state.destroyed) return;
		const now = performance.now();
		const delta = Math.min(
			(now - this.context.state.previousFrameTime) / 1000,
			0.1,
		);
		this.context.state.previousFrameTime = now;
		const seconds = (now - this.context.state.started) / 1000;
		if (this.context.state.view === "globe") {
			if (
				this.context.state.globeScene.floatingRing?.visible &&
				!this.context.state.reducedMotion.matches
			)
				this.context.state.globeScene.floatingRing.material.uniforms.time.value =
					this.context.state.reducedMotion.matches ? 0 : seconds;
			if (
				this.context.state.globeScene.scan &&
				this.context.state.globeScene.layers.scan.visible
			) {
				this.context.state.globeScene.scan.visible =
					!this.context.state.reducedMotion.matches;
				this.context.state.globeScene.scan.material.uniforms.time.value = this
					.context.state.reducedMotion.matches
					? 0
					: seconds;
			}
			this.context.state.globeScene.effects.rotation.y =
				Math.sin(seconds * 0.06) * 0.08;
			this.context.state.globeScene.pulseRings.forEach((ring, index) => {
				const phase = (seconds * 0.52 + index / 3) % 1;
				ring.scale.setScalar(0.65 + phase * 1.25);
				(ring.material as MeshBasicMaterial).opacity = 0.48 * (1 - phase);
			});
			this.context.state.globeScene.freight?.update(seconds);
			this.context.state.globeScene.layers.scatter.traverse((child) => {
				if (!(child instanceof Sprite)) return;
				const material = child.material;
				material.userData.referenceOpacity ??= material.opacity;
				material.opacity =
					material.userData.referenceOpacity *
					this.context.state.globeLabelOpacity;
			});
			if (
				this.context.state.globeScene.mesh &&
				!this.context.state.dragStart &&
				!this.context.state.switchingView &&
				!this.context.state.angleTween?.isActive() &&
				!this.context.state.transitionTimeline?.isActive()
			)
				this.context.state.globeScene.mesh.rotation.y += delta * 0.0015;
			if (
				this.context.state.globeScene.clouds &&
				!this.context.state.reducedMotion.matches
			) {
				this.context.state.globeScene.clouds.rotation.y += delta * 0.009;
				this.context.state.globeScene.clouds.material.uniforms.time.value = this
					.context.state.reducedMotion.matches
					? 0
					: seconds;
			}
		} else {
			for (const alert of this.context.state.overlays.alertAnimations) {
				if (!this.context.controllers().interaction.isVisible(alert.point))
					continue;
				// At vertical top view retain only the physical edge, including off-centre points.
				alert.label.material.opacity = this.context.state.topView
					? Math.min(
							1,
							Math.max(0, (Math.PI / 2 - this.context.state.cameraPitch) / 0.2),
						)
					: 1;
				alert.body.position.z =
					(0.46 +
						(this.context.state.reducedMotion.matches
							? 0
							: Math.sin(seconds * 2.1 + alert.offset) * 0.025)) *
					alert.scale;
				alert.body.rotation.z = this.context.state.reducedMotion.matches
					? alert.offset
					: seconds * 0.18 + alert.offset;
				alert.pulse.material.uniforms.time.value = this.context.state
					.reducedMotion.matches
					? 0
					: seconds;
			}
			this.context.state.geometry.sideMaterials.forEach((material) => {
				material.uniforms.time.value = this.context.state.reducedMotion.matches
					? 0
					: seconds;
			});
		}
		this.updateMapNames();
		this.context.state.mapEffects.update(
			seconds,
			this.context.state.reducedMotion.matches ||
				this.context.state.view !== "china",
		);
		this.context.state.layerMotion.update();
		this.context.state.regionGeometry.reveal.update();
		this.context.state.composer.render();
		this.context.state.cloudTransition.render(
			this.context.state.renderer,
			this.context.state.camera,
		);
		this.context.controllers().interaction.updateMonitoringPoint();
		this.context.state.animationFrame = requestAnimationFrame(this.animate);
	};
}

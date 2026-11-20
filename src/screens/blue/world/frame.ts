/**
 * 渲染循环：每帧推进 shader 时间、球体自转、告警脉冲、地名透明度与区域几何过渡，
 * 最后统一走 EffectComposer 出图并叠加云层擦除。
 * 由 BlueWorld 在构造末尾启动，递归 requestAnimationFrame 自驱动；
 * 销毁时由 resources.destroy 取消动画帧。
 */
import gsap from "gsap";
import { type MeshBasicMaterial, Sprite, type Vector3 } from "three";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";

/**
 * 渲染循环所需的状态切片与控制器访问器。
 * 只声明本文件读写的字段；controllers 惰性取值，构造期控制器尚未全部就绪。
 */
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

/**
 * 帧循环控制器。
 * animate 是唯一的驱动入口，所有逐帧动画都以「秒」为时间基准，
 * 因此不同刷新率与掉帧情况下动画速度保持一致。
 */
export default class WorldFrame {
	constructor(private readonly context: WorldFrameContext) {}

	/**
	 * 创建一块地名标注，转发给 MapLabels 工厂。
	 * 已下钻时字号要乘以特效组当前的缩放，才能与整体缩小的地图保持视觉一致。
	 * @param name 显示文字
	 * @param position 标注锚点（世界坐标）
	 * @param leaf 是否为叶子节点（区县），决定默认字号与排版
	 * @param pixels 字号（屏幕像素），缺省按 leaf 取 16 / 14
	 * @param variant region 为当前层级地名、context 为周边弱化地名
	 */
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

	/**
	 * 把中国地名整体透明度补间到 1，即「恢复呼吸」。
	 * 视图切换、下钻加载中或已有主过渡在跑时直接返回，由那条时间线结束时再调用，
	 * 避免多条补间同时改 mapLabelOpacity。
	 */
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
			// 已部分可见时立即淡入；只有从全透明开始才等 0.2s，让镜头先落位
			delay:
				this.context.state.reducedMotion.matches ||
				this.context.state.mapLabelOpacity > 0
					? 0
					: 0.2,
			ease: "power2.out",
		});
	}

	/**
	 * 逐帧刷新地名：context 类地名随整体透明度下沉隐藏，region 类保持贴合地表；
	 * 同时按所属图层的入场进度额外抬升，避免图层淡入时文字先浮出来。
	 * 非本工厂创建、但挂在标签容器里的 Sprite 也按整体透明度等比缩放。
	 */
	updateMapNames() {
		for (const label of this.context.state.mapLabels.surfaceLabels) {
			// frozenLabels 中的地名由 regionGeometry 过渡接管，这里不要覆盖它的位置与透明度
			if (this.context.state.regionGeometry.current?.frozenLabels.has(label))
				continue;
			const { variant, surfaceHeight, riseDepth } = label.userData.mapName;
			let layerReveal = 1;
			// 向上找到所属图层容器，取它的入场进度；找不到则视为完全显现
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
				// 周边地名：整体透明度归零时整体沉到地表以下，另按图层进度再补一点下沉量
				label.position.z =
					surfaceHeight -
					riseDepth * (1 - this.context.state.mapLabelOpacity) -
					riseDepth * 0.07 * (1 - layerReveal);
			} else {
				label.position.z =
					surfaceHeight - riseDepth * 0.045 * (1 - layerReveal);
			}
			// 三个系数相乘：整体淡入、单块地名的错峰显现、主体/周边的亮度差
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
				// referenceOpacity 只记录一次原始值，后续都以它为基准，
				// 否则每帧相乘会让透明度指数衰减
				child.material.userData.referenceOpacity ??= child.material.opacity;
				child.material.opacity =
					child.material.userData.referenceOpacity *
					this.context.state.mapLabelOpacity;
			}
		}
	}

	/**
	 * 每帧入口：先按墙钟时间算出 delta，再按当前视图分支推进各自动画，最后统一渲染。
	 * delta 来自 performance.now() 的差值除以 1000 转成秒；上限 0.1s 是为了在
	 * 标签页切回、长任务卡顿后不让球体一次性转过一大段（跳帧），保持视觉连续。
	 */
	animate = () => {
		if (this.context.state.destroyed) return;
		const now = performance.now();
		const delta = Math.min(
			(now - this.context.state.previousFrameTime) / 1000,
			0.1,
		);
		// 先更新时间戳再分支处理，即使后面提前返回，也不会累积出巨大的下一帧 delta
		this.context.state.previousFrameTime = now;
		// seconds 是自启动以来的绝对时长，shader 与正弦动画都用它，避免逐帧累加的误差
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
			// 0.06 的频率制造极慢的左右摆动，幅度 0.08 rad，避免静止画面显得死板
			this.context.state.globeScene.effects.rotation.y =
				Math.sin(seconds * 0.06) * 0.08;
			this.context.state.globeScene.pulseRings.forEach((ring, index) => {
				// 三圈相位错开 1/3 周期，形成连续向外扩散的波纹
				const phase = (seconds * 0.52 + index / 3) % 1;
				ring.scale.setScalar(0.65 + phase * 1.25);
				(ring.material as MeshBasicMaterial).opacity = 0.48 * (1 - phase);
			});
			this.context.state.globeScene.freight?.update(seconds);
			this.context.state.globeScene.layers.scatter.traverse((child) => {
				if (!(child instanceof Sprite)) return;
				const material = child.material;
				// 同上：原始透明度只缓存一次，防止逐帧相乘导致越来越透明
				material.userData.referenceOpacity ??= material.opacity;
				material.opacity =
					material.userData.referenceOpacity *
					this.context.state.globeLabelOpacity;
			});
			// 球体自转只在无拖拽、无切换、无补间时进行，否则会与用户的输入抢控制权
			if (
				this.context.state.globeScene.mesh &&
				!this.context.state.dragStart &&
				!this.context.state.switchingView &&
				!this.context.state.angleTween?.isActive() &&
				!this.context.state.transitionTimeline?.isActive()
			)
				// 0.0015 rad/秒的基准速度，乘 delta 保证不同刷新率下转速一致
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
				// 正俯视时标签会与地图重叠：按剩余俯仰角在 0.2 rad 内线性淡出，只保留光点本体
				alert.label.material.opacity = this.context.state.topView
					? Math.min(
							1,
							Math.max(0, (Math.PI / 2 - this.context.state.cameraPitch) / 0.2),
						)
					: 1;
				// 0.46 是图标离地的基础高度；0.025 的上下浮动在有动画偏好时才叠加
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
		// 云层擦除叠加在合成结果之上，需要读取最终画面做擦除，因此放在 composer 之后
		this.context.state.cloudTransition.render(
			this.context.state.renderer,
			this.context.state.camera,
		);
		// 用本帧已更新的相机矩阵投影监测点，弹窗位置才与画面严格对齐
		this.context.controllers().interaction.updateMonitoringPoint();
		this.context.state.animationFrame = requestAnimationFrame(this.animate);
	};
}

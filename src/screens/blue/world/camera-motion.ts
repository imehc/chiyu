/**
 * 镜头编排：负责首屏中国地图入场、视图切换的推拉入场、下钻/返回的姿态过渡。
 * 所有过渡都通过 GSAP 时间线改写 WorldState 的标量字段，再回调 camera 重算相机矩阵。
 * 由 BlueWorld 创建；resources 触发首屏入场，view/regions 触发切换与下钻，
 * interaction 在指针按下时调用 stopCameraControls 打断正在播放的镜头。
 */
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

/**
 * 镜头补间所需的状态切片与控制器访问器。
 * 只列出本文件读写的字段；controllers 惰性取值，构造期控制器尚未全部就绪。
 */
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

/**
 * 镜头补间控制器。
 * 约定：任何新动画开始前先 kill 旧时间线并 stopCameraControls，
 * 保证同一时刻只有一条补间在写相机，避免两条补间互相拉扯。
 */
export default class CameraMotion {
	constructor(private readonly context: CameraMotionContext) {}

	/**
	 * 首屏中国地图入场：地图先以压扁、透明、下沉的形态出现，
	 * 再从重庆方向的低空远景推进到正视角，同时抬升各图层的 z 缩放与透明度。
	 * 结束后还原被改写的材质状态并让地名淡入；prefers-reduced-motion 下直接跳到终态。
	 */
	playChinaEntrance() {
		this.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		this.context.state.labelTween?.kill();
		this.context.state.mapLabelOpacity = 0;
		if (this.context.state.reducedMotion.matches) {
			// 无动画偏好：直接把状态写成终态，仍要走一遍刷新与特效重启
			this.context.state.zoomLevel = 1;
			this.context.state.cameraPitch = 0.72;
			this.context.state.cameraYaw = 0;
			this.context.controllers().camera.updateCamera();
			this.context.state.mapEffects.restartEntrance();
			this.context.controllers().frame.revealMapNames();
			return;
		}
		// 特效组单独由 mapEffects.restartEntrance 驱动，不参与本段材质补间，否则会重复淡入
		const objects = this.context.state.chinaScene.map.children
			.filter((object) => object !== this.context.state.mapEffects.group)
			.map((object) => ({
				object,
				scaleZ: object.scale.z,
				positionZ: object.position.z,
			}));
		// 收集所有材质的原始透明度与混合设置，供中途被打断时精确还原；
		// 用 Set 去重，多个网格常常共享同一份材质
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
			// z 缩放压到 0 形成「贴地压扁」，位置再下沉 0.01，避免与底图产生 z-fighting
			object.scale.z = 0;
			object.position.z = positionZ - 0.01;
		}
		for (const { material } of materials) {
			material.opacity = 0;
			material.transparent = true;
			// 入场期间关掉深度写入，半透明图层互相遮挡时才不会出现硬边
			material.depthWrite = false;
			material.needsUpdate = true;
		}
		// 以重庆方向的低空斜视作为起始机位：固定倍率与弧度而非像素偏移，保证任意视口构图一致
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
				// 结束后把材质与几何恢复到原始状态，再重启特效与地名
				this.restoreChinaEntrance();
				this.context.controllers().camera.updateCamera();
				this.context.state.mapEffects.restartEntrance(0.25);
				this.context.controllers().frame.revealMapNames();
			},
		});
		entrance.timeline = timeline;
		// 挂到共享的 transitionTimeline 上，其它控制器据此判断「是否有主过渡在跑」
		this.context.state.transitionTimeline = timeline;
		// 0~2s：镜头推进、俯仰回正；1.5s 起图块抬升；2s 起体块显现与材质淡入
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

	/**
	 * 还原入场动画改动过的所有属性：对象的 z 缩放与位移、材质的透明度与混合模式、
	 * 体块显现值。入场被用户操作打断时也会走到这里，因此必须幂等。
	 */
	restoreChinaEntrance() {
		const entrance = this.context.state.chinaEntrance;
		if (!entrance) return;
		// 先 kill 再清引用，避免时间线的 onComplete 再触发一次还原
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

	/**
	 * 中止视图切换的入场时间线：把中国场景缩放置回 1，并通知外部回到 idle。
	 * switchingView 为真时由 view 自己负责后续状态，这里不重复回调。
	 */
	stopViewEntrance() {
		if (this.context.state.viewEntranceActive) {
			this.context.state.transitionTimeline?.kill();
			this.context.state.viewEntranceActive = false;
			// 入场期间地图 y 缩放被压到 0.96，中断时必须复位，否则会一直显得扁
			this.context.state.chinaScene.root.scale.setScalar(1);
			if (!this.context.state.switchingView)
				this.context.state.callbacks.onViewMotionChange?.("idle");
		}
	}

	/**
	 * 停止所有镜头类补间（首屏入场、视图入场、缩放、俯视），并清空目标倍率。
	 * 指针按下、下钻与视图切换前都会调用，确保用户输入不会被上一段动画覆盖。
	 */
	stopCameraControls() {
		this.restoreChinaEntrance();
		this.stopViewEntrance();
		this.context.state.zoomTween?.kill();
		this.context.state.angleTween?.kill();
		this.context.state.zoomTween = undefined;
		this.context.state.angleTween = undefined;
		this.context.state.zoomTarget = undefined;
	}

	/**
	 * 准备视图切换的入场动画：先把相机与标签放到略微「过冲」的起始状态，
	 * 再用暂停的时间线从远处推近、俯仰回正。
	 * 与首屏入场刻意区分：这里更克制，避免每次切换都像重新加载一次。
	 * @param view 目标视图；china 时先压扁地图 y 缩放，globe 时先让球体偏转一点
	 */
	prepareViewEntrance(view: View) {
		// 切换使用克制的揭示动画，首屏那次完整飞行不在这里复用
		this.context.state.zoomLevel = view === "globe" ? 1 : 0.97;
		this.context.state.cameraPitch = 0.76;
		this.context.state.cameraYaw = 0;
		this.context.state.mapLabelOpacity = view === "china" ? 0.25 : 0;
		this.context.state.globeLabelOpacity = view === "globe" ? 0.3 : 0;
		if (view === "china") this.context.state.chinaScene.root.scale.y = 0.96;
		else if (this.context.state.globeScene.mesh)
			// 0.06 rad 的偏航偏移，让推近过程中带一点侧向转动感
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
		// 用距离倒数驱动 zoomLevel：推近时近处慢、远处快，视觉速度更均匀
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
		// 标签延后 0.35s 才淡入：镜头先动、文字后到，比两者同时起步更不抢注意力
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
		// 侧边按钮的错峰动画在 1.9s 落定，2s 再恢复地名呼吸，避免文字与按钮同时抢注意力
		timeline.call(
			() => this.context.controllers().frame.revealMapNames(),
			[],
			2,
		);
	}

	/**
	 * 下钻/返回的区域镜头过渡：在中国平面内同时插值目标点、缩放、俯仰、偏航与自转角。
	 * 与 transitionCamera 的区别是它还要驱动 regionGeometry 的几何替换进度，
	 * 让镜头推进与旧几何淡出、新几何抬升共用同一条时间线，不会出现两段拼接感。
	 * @param target 目标区域中心（世界坐标）
	 * @param zoom 目标缩放倍率
	 * @param returnPose 返回上级时的姿态快照；缺省则按当前区域构造正向姿态
	 */
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
			// 下钻时的自转轴心取该区域的归位目标；全国视图没有具体区域，退回原点
			rotationCenter: this.context.state.selectedRegion
				? new Vector2(
						this.context.state.detailHomeTarget.x,
						-this.context.state.detailHomeTarget.z,
					)
				: new Vector2(),
			topView: false,
		};
		// 取最短角差：把任意角度折算到 -π~π，避免 350° → 10° 时倒转一整圈
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
			// 五次平滑曲线（quintic smootherstep）：两端一阶、二阶导均为 0，
			// 首尾速度与加速度都归零，最后几帧稳稳落在同一份实时几何上，而不是靠替换模型掩盖抖动
			const progress = time * time * time * (time * (time * 6 - 15) + 10);
			// 缩放按比例插值，推近与拉远的视觉速度一致，地图替换处不需要额外停顿
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
				// 用原始 time 与平滑后的 progress 共同驱动几何：前者控制退场节奏，后者控制位置
				this.context.state.regionGeometry.advance(transition, time, progress);
			}
			this.context.controllers().camera.updateMapRotation();
			this.context.controllers().camera.updateCamera();
		};
		const timeline = gsap.timeline({
			onComplete: () => {
				// 收尾时用快照对齐一次，抹掉累加的浮点误差
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

	/**
	 * 通用镜头飞行：把观察点与缩放推到指定值，用于视图重置、聚焦等非下钻场景。
	 * 中国视图下会先隐藏地名、重启地图特效，飞行结束后再淡入。
	 * @param target 目标观察点（世界坐标）
	 * @param zoom 目标缩放倍率
	 * @param duration 时长（秒），reducedMotion 下强制为 0
	 * @param delay 起始延迟（秒），reducedMotion 下同样归零
	 */
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
		// 同样用 1/zoom 作为补间变量：对数尺度上匀速，推拉的视觉节奏才一致
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
				// 只有中国视图才回正俯仰与偏航；地球视图的机位由球体旋转决定
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

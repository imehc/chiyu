/**
 * 指针交互：悬停高亮、拖拽旋转、滚轮缩放、区域点击下钻与监测点弹窗定位。
 * 事件在 BlueWorld 构造时绑定到画布，再通过 callbacks 把业务意图回传给 Solid 层；
 * 依赖 camera 重算相机、cameraMotion 在指针按下时打断补间、frame 恢复地名呼吸。
 */
import gsap from "gsap";
import type { Mesh, ShaderMaterial, Sprite } from "three";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";

/**
 * 交互控制器所需的状态切片与控制器访问器。
 * 只声明本文件读写的字段；controllers 惰性取值，构造期控制器尚未全部就绪。
 */
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

/**
 * 画布指针交互控制器。
 * 事件处理器都是箭头函数属性，便于 BlueWorld 直接 add/removeEventListener（引用稳定）；
 * 拖拽与点击靠 dragStart.moved 区分，移动超过阈值即视为旋转而非点击。
 */
export default class WorldInteraction {
	constructor(private readonly context: WorldInteractionContext) {}

	/**
	 * 逐帧把当前监测点标记投影到屏幕坐标，驱动 Solid 层的弹窗定位。
	 * 标记不可见、移出视口或切到地球视图时自动关闭弹窗；
	 * 位置变化小于 0.1px 不回调，避免每帧都触发响应式更新。
	 */
	updateMonitoringPoint() {
		const marker = this.context.state.activeMonitoringMarker;
		if (!marker) return;
		if (this.context.state.view !== "china" || !this.isVisible(marker)) {
			this.closeMonitoringPoint();
			return;
		}
		marker.getWorldScale(this.context.state.monitoringScale);
		// 沿相机朝上的方向偏移一个标记高度，让弹窗浮在图标上方而不是压住图标；
		// (1 - center.y) 修正 Sprite 默认锚点在几何中心的偏差
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
		// z 超出 ±1 说明点在相机背后或近远裁剪面之外；x/y 越界则是移出了视口
		if (z < -1 || z > 1 || Math.abs(x) > 1 || Math.abs(y) > 1) {
			this.closeMonitoringPoint();
			return;
		}
		// NDC(-1~1) → 屏幕像素：x 从左到右、y 从上到下，y 需翻转；
		// 末尾 -4 是弹窗尖角与图标的视觉间距
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

	/**
	 * 关闭监测点弹窗并清空选中标记；未打开时直接返回，可重复调用。
	 */
	closeMonitoringPoint() {
		if (!this.context.state.activeMonitoringMarker) return;
		this.context.state.activeMonitoringMarker = undefined;
		this.context.state.monitoringPosition = undefined;
		this.context.state.callbacks.onMonitoringPoint?.(null);
	}

	/**
	 * 把指针位置转成 NDC 后做射线拾取，返回命中的区域网格。
	 * 屏幕坐标 → 归一化设备坐标（NDC）：先减去画布左上角偏移并除以宽高得到 0~1，
	 * 再线性映射到 -1~1；y 轴必须取反，因为浏览器 y 向下而 NDC y 向上。
	 * 只对当前层级的可拾取网格求交（下钻后是 detailMeshes，否则是省级 regionMeshes），
	 * 并先滤掉不可见的对象，避免射线打到已淡出的旧几何或关闭的图层。
	 * @param event 指针事件，坐标取自 clientX / clientY（视口坐标）
	 * @returns 最近的命中网格，未命中为 undefined
	 */
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
		// recursive 传 false：区域网格都是扁平 Mesh，不需要遍历子树
		return this.context.state.raycaster.intersectObjects(
			(this.context.state.drillPath.length
				? this.context.state.detailMeshes
				: this.context.state.chinaScene.regionMeshes
			).filter((mesh) => this.isVisible(mesh)),
			false,
		)[0]?.object as Mesh | undefined;
	}

	/**
	 * 切换悬停高亮的网格：把上一个网格的 hovered uniform 补间回 0，新网格补到 1。
	 * 用 gsap 而非直接赋值，是为了快速划过时高亮能平滑过渡；
	 * overwrite 保证同一条 uniform 上不会堆叠多条补间。
	 * @param mesh 新的悬停网格，传 undefined 表示清空
	 */
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

	/**
	 * 指针移动：拖拽时旋转地球或地图，未拖拽时更新悬停高亮。
	 * 视图切换与区域几何过渡期间整体短路，避免与补间抢相机。
	 */
	onPointerMove = (event: PointerEvent) => {
		if (
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		if (this.context.state.dragStart) {
			const dx = event.clientX - this.context.state.dragStart.x;
			const dy = event.clientY - this.context.state.dragStart.y;
			// 超过 5px 才认定为拖拽：阈值太小会把点击时的手抖误判成旋转
			if (Math.hypot(dx, dy) > 5) this.context.state.dragStart.moved = true;
			if (
				this.context.state.view === "globe" &&
				this.context.state.globeScene.mesh
			) {
				if (this.context.state.dragStart.moved)
					this.context.state.topView = false;
				// 0.005 rad/px：1920px 全屏拖动约 9.6 rad（约 1.5 圈）；地球直接改欧拉角，不做插值
				this.context.state.globeScene.mesh.rotation.y += dx * 0.005;
				this.context.state.globeScene.mesh.rotation.x += dy * 0.005;
			} else if (
				this.context.state.view === "china" &&
				this.context.state.dragStart.moved
			) {
				this.context.state.mapRotation += dx * 0.005;
				// 俯仰限制在 0.38~1.5 rad：再小会贴到地面，再大就翻到地图背面
				this.context.state.cameraPitch = Math.max(
					0.38,
					Math.min(1.5, this.context.state.cameraPitch + dy * 0.004),
				);
				this.context.state.topView = false;
				this.context.controllers().camera.updateMapRotation();
				this.context.controllers().camera.updateCamera();
			}
			if (this.context.state.dragStart.moved) {
				// 只有确认拖拽后才移动基准点，否则最初的微小位移会被丢掉
				this.context.state.dragStart.x = event.clientX;
				this.context.state.dragStart.y = event.clientY;
			}
		}
		// detailLoading 期间不拾取：此时几何正在替换，raycaster 可能命中即将销毁的网格
		if (
			this.context.state.view === "china" &&
			!this.context.state.detailLoading
		)
			this.setHovered(this.intersectRegion(event));
	};

	/**
	 * 指针按下：记录起点并打断所有镜头补间，让用户立刻接管相机。
	 * 此时还分不清点击与拖拽，moved 先置 false，由 move 事件决定。
	 */
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

	/**
	 * 指针抬起：未发生拖拽时按点击处理，优先级为监测点 → 区域下钻。
	 * 监测点只在点/标签图层可见或已下钻时参与拾取，避免点到不可见的图标。
	 */
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
			// 先做一次区域拾取（内部会 setFromCamera），后续监测点拾取复用同一条射线
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
					// 再次点击同一标记视为关闭，符合「开关式」弹窗的直觉
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
			// 点在空白处：先关掉已打开的弹窗，再判断是否命中区域
			this.closeMonitoringPoint();
			if (!this.context.state.detailLoading) {
				const mesh = this.intersectRegion(event);
				if (mesh)
					this.context.state.callbacks.onRegion?.(mesh.userData.name as string);
			}
		}
	};

	/**
	 * 指针离开画布：取消拖拽状态、清空悬停高亮并恢复地名呼吸。
	 */
	onPointerLeave = () => {
		this.context.state.dragStart = undefined;
		this.setHovered(undefined);
		this.context.controllers().frame.revealMapNames();
	};

	/**
	 * 滚轮缩放：向上滚（deltaY < 0）拉近，向下滚拉远。
	 * preventDefault 阻止页面跟着滚动，因此绑定时必须使用 passive: false。
	 */
	onWheel = (event: WheelEvent) => {
		event.preventDefault();
		this.context.controllers().camera.zoom(event.deltaY > 0 ? 0.92 : 1.08);
	};

	/**
	 * 判断对象是否在场景中真正可见：自身与所有祖先的 visible 都为 true，
	 * 且最终能追溯到主场景根（防止对象已被移出场景却仍被引用）。
	 * @param object 待检查的 Three.js 对象
	 */
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

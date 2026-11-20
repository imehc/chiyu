/**
 * 相机控制器：维护透视相机的位姿（距离、俯仰、偏航、自转角），
 * 在中国平面与地球两套视图之间做插值，并补偿地图旋转带来的世界容器平移。
 * 由 BlueWorld 组装控制器时创建；交互（缩放、俯视、拖拽）与镜头补间
 * （camera-motion）只改状态标量，最终都调用这里把结果写回 Three.js 相机。
 */
import gsap from "gsap";
import { type Mesh, Vector3 } from "three";
import { GLOBE_SCAN_RADIUS } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { MapCameraPose } from "./types";

/**
 * 相机控制器所需的状态切片与控制器访问器。
 * state 只列出本文件真正读写的字段，避免与 WorldState 全量耦合；
 * controllers 采用惰性取值，因为构造期其它控制器尚未创建完成。
 */
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

/**
 * 透视相机与世界容器的控制器。
 * 约定：相机位姿先落在 WorldState 的标量字段上，再由 updateCamera 统一换算成
 * 世界坐标，因此补间只需改标量，不必直接操作相机矩阵。
 */
export default class WorldCamera {
	constructor(private readonly context: WorldCameraContext) {}

	/**
	 * 同步画布尺寸、渲染器、后期合成链与相机投影，并重算中国视图的基准距离。
	 * 由 ResizeObserver 与 window resize 触发；容器宽高可能为 0（面板收起），
	 * 因此下限取 1 像素，避免除零与投影矩阵出现 NaN。
	 */
	resize = () => {
		const bounds = this.context.state.canvas.getBoundingClientRect();
		const width = Math.max(Math.round(bounds.width), 1);
		const height = Math.max(Math.round(bounds.height), 1);
		// 像素比封顶 2：与 WorldState 构造时保持一致，高分屏继续上调只会成倍增加填充率
		const pixelRatio = Math.min(window.devicePixelRatio, 2);
		if (this.context.state.renderer.getPixelRatio() !== pixelRatio) {
			this.context.state.renderer.setPixelRatio(pixelRatio);
			this.context.state.composer.setPixelRatio(pixelRatio);
		}
		// updateStyle 传 false：CSS 尺寸由布局决定，这里只改渲染缓冲大小
		this.context.state.renderer.setSize(width, height, false);
		this.context.state.renderer.getDrawingBufferSize(
			this.context.state.geometry.contextViewport,
		);
		this.context.state.composer.setSize(width, height);
		this.context.state.camera.aspect = width / height;
		this.context.state.camera.updateProjectionMatrix();
		// 中国横向约 15 个地图单位，占源视频宽度的 40%；
		// 用 36° 垂直视场角的一半（18°）反推斜距，使地图在任何宽高比下保持同样的占屏比例
		this.context.state.cameraDistance =
			15.3 /
			(0.4212 *
				this.context.state.camera.aspect *
				2 *
				Math.tan((36 * Math.PI) / 360));
		this.updateCamera();
	};

	/**
	 * 计算地球视图下相机到球心的距离（世界坐标）。
	 * 先按「球体直径占视口高度的比例」取水平方向的可用宽度（最宽 73%，窄屏时按宽高比收缩），
	 * 再由半视场角得到切线长度，用勾股定理换算成斜距，保证球体完整落在画面内。
	 * @returns 相机到球心的距离，随视口宽高比变化
	 */
	globeCameraDistance() {
		const diameterFraction = Math.min(
			0.73,
			this.context.state.camera.aspect * 0.36,
		);
		const tangent = Math.tan((36 * Math.PI) / 360) * diameterFraction;
		return 5.1 * Math.sqrt(1 + 1 / tangent ** 2);
	}

	/**
	 * 由 zoomLevel、cameraPitch、cameraYaw 与 viewMix 重算相机位置。
	 * viewMix=0 时使用中国平面的球坐标偏移，=1 时完全取地球距离；
	 * 中间值用于视图切换时的平滑过渡。
	 * 纯计算函数，不启动动画，因此可以安全地在每帧或补间 onUpdate 中调用。
	 */
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
		// 近裁剪面随距离收缩，避免贴近地表时穿模；上限 0.1 保证远景仍有足够的深度精度
		this.context.state.camera.near = Math.min(0.1, distance * 0.05);
		this.context.state.camera.lookAt(this.context.state.target);
		this.context.state.camera.updateProjectionMatrix();
		if (this.context.state.globeScene.radiance) {
			const distance = this.context.state.camera.position.length();
			// 按当前相机距离等比放缩扫描光晕，使其投影后的轮廓始终贴合扫描球壳
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

	/**
	 * 快照当前镜头姿态，供下钻返回或视图切换时还原。
	 * target 与 rotationCenter 都做了克隆，调用方可以长期持有而不被后续修改影响。
	 * @returns 当前的目标点（世界坐标）、缩放倍率、俯仰/偏航/自转角（弧度）与俯视标记
	 */
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

	/**
	 * 把快照写回状态并立即刷新世界容器旋转与相机，字段与 getMapCameraPose 一一对应。
	 * 用于下钻返回、镜头过渡收尾时的最终对齐，避免浮点误差残留。
	 * @param pose 之前由 getMapCameraPose 取得的姿态快照
	 */
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

	/**
	 * 二分搜索「刚好把行政区域完整装进画面」的缩放倍率。
	 * 逐个顶点投影到 NDC，检查是否落在预设的安全框内：叶子节点（区县）留出更大边距，
	 * 因为其轮廓更碎、地名更密；上界 14/span 防止极小区域导致镜头无限拉近。
	 * @param mesh 目标区域网格，顶点为 GeoJSON 平面坐标（x, y, 高度 z）
	 * @param target 镜头观察点（世界坐标）
	 * @param spatialScale 该网格相对基础地图的缩放系数，用于把局部高度换算成世界高度
	 * @param span 区域包围盒的世界坐标跨度，决定缩放上界
	 * @returns 可用缩放倍率，下限 0.25，避免缩放过小后地图只剩一个点
	 */
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
		// 把真实轮廓（含抬起的侧面）装进画面中央的显示区，而不是只按包围盒估算
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
				// GeoJSON 的 y 在场景里映射到 -z：地图绕 x 轴转了 -90°；
				// 正高度额外抬 0.025，把高出地面的描边也算进轮廓
				point
					.set(
						positions.getX(index),
						this.context.state.chinaScene.map.position.y +
							(height + (height > 0 ? 0.025 : 0)) * spatialScale,
						-positions.getY(index),
					)
					.project(this.context.state.camera);
				// project 之后得到 NDC，x/y 落在 -1~1；超出安全框即判定放不下
				if (
					Math.abs(point.x) > (leaf ? 0.27 : 0.4) ||
					point.y > (leaf ? 0.4 : 0.52) ||
					point.y < (leaf ? -0.6 : -0.72)
				) {
					fits = false;
					break;
				}
			}
			// 二分 20 次已足够精确，继续迭代对视觉没有意义
			if (fits) lower = zoom;
			else upper = zoom;
		}
		this.updateCamera();
		return Math.max(0.25, lower);
	}

	/**
	 * 按倍率缩放中国视图，带缓动与上下限。
	 * 下钻层以 detailZoom 为基准、全国视图基准为 1，避免不同层级下滚轮手感突变。
	 * 视图切换、区域几何过渡、未就绪或已销毁时直接忽略，防止与主过渡抢相机。
	 * @param factor 相对倍率，>1 拉近、<1 拉远（滚轮每次取 0.92 / 1.08）
	 */
	zoom(factor: number) {
		if (
			this.context.state.destroyed ||
			!this.context.state.ready ||
			this.context.state.switchingView ||
			this.context.state.regionGeometry.current
		)
			return;
		// 先收掉入场与切换动画，否则它们会继续写 zoomLevel，和本次缩放互相打架
		this.context.controllers().cameraMotion.restoreChinaEntrance();
		this.context.controllers().cameraMotion.stopViewEntrance();
		this.context.state.transitionTimeline?.kill();
		const baseline = this.context.state.selectedRegion
			? this.context.state.detailZoom
			: 1;
		// 限制在基准的 0.48~2.6 倍：再远会露出地图边缘，再近会穿进立体块内部
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

	/**
	 * 切到正俯视：中国视图把 cameraPitch 抬到 90°，地球视图改为转动球体，
	 * 让镜头方向垂直穿过球心。切换或几何过渡期间直接忽略；完成后恢复地名淡入。
	 */
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
		// 时长与缓动同时复用给「转球体」和「抬俯仰」两条分支，保持两种视图的手感一致
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
			// 球体不能像平面那样直接改俯仰，只能反算一个让「相机方向」变成画面正上的旋转角
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

	/**
	 * 应用地图自转角 mapRotation，并同步平移中国场景各容器。
	 * 旋转以 mapRotationCenter（世界坐标）为轴心：先把地图转到新角度，再反推容器偏移，
	 * 使当前区域在旋转过程中始终留在镜头下；否则绕原点旋转会把边缘省份甩出画面。
	 * 周边国家、地名与各业务图层共用同一角度，避免装饰物与底图错位。
	 */
	updateMapRotation() {
		const { x, y } = this.context.state.mapRotationCenter;
		const cosine = Math.cos(this.context.state.mapRotation),
			sine = Math.sin(this.context.state.mapRotation);
		// 绕轴心旋转后再补偿平移，等价于「原地自转」，镜头无需跟着移动
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

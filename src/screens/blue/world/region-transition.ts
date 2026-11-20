/**
 * 下钻边界过渡：镜头飞行期间同时持有旧层级（outgoing）与新层级（incoming），
 * 用 LayerMotion 注入的 blueLayerReveal uniform 做交叉淡出，并临时压缩新层级的厚度，
 * 让「替换地图」看起来像同一次连续推镜而不是换图。
 * 由 WorldState 创建为 regionGeometry：regions 在进入/返回时调用 retainOutgoing 与
 * prepareIncoming，camera-motion 的时间线逐帧调用 advance，飞行结束时调用 finish。
 */
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

/**
 * 过渡器依赖：场景与相机等构造期就已存在的对象直接注入，
 * 控制器相关能力（关闭监测点、释放网格、返回上级）用回调形式传入，避免循环依赖。
 */
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

/**
 * 把任意输入夹到 0~1 并做 smoothstep。
 * 首尾导数为 0，淡入淡出不会出现突兀的启停。
 */
const smoothProgress = (value: number) => {
	const progress = Math.min(1, Math.max(0, value));
	return progress * progress * (3 - 2 * progress);
};

/**
 * 下钻边界过渡器。
 * 一次过渡的生命周期：retainOutgoing（冻结旧画面）→ prepareIncoming（准备新画面）→
 * advance（逐帧推进）→ finish（归位、释放旧对象、处理被延迟的返回）。
 * 同一时刻只允许存在一个 current，重复触发会先 finish 再重建。
 */
export default class RegionTransition {
	/** 过渡专用的显隐管理器，与全局 layerMotion 分开，避免与图层开关的状态互相覆盖 */
	readonly reveal = new LayerMotion();
	/** 当前进行中的过渡；undefined 表示没有过渡在跑 */
	current: RegionGeometryTransition | undefined;
	/** 过渡期间的返回请求：等飞行结束再执行，避免层级栈被连续弹出 */
	pendingBack = false;
	constructor(private readonly context: RegionTransitionContext) {}

	/**
	 * 冻结当前可见画面作为「旧层级」：把地图块与世界级对象摘进两个过渡分组，
	 * 同时记录原始父节点、渲染顺序与可见性，供 finish 还原。
	 * 必须在构建新层级之前调用，否则新对象会被一起冻结。
	 */
	retainOutgoing() {
		// 幂等：上一次过渡若还没收尾，先让它结束并释放旧对象
		this.finish();
		// 旧网格即将被摘出场景，悬停态与监测点弹窗依赖它的世界坐标，必须先关闭
		this.context.callbacks.closeMonitoringPoint();
		this.context.callbacks.setHovered(undefined);
		// 特效组不参与冻结：它由 advance 单独做位置/缩放插值
		const mapObjects = this.context.china.map.children.filter(
			(object) => object.visible && object !== this.context.mapEffects.group,
		);
		const worldObjects = [
			this.context.china.labels,
			this.context.china.background,
			this.context.china.orbitRing,
			...Object.values(this.context.china.layers),
		].filter((object) => this.context.callbacks.isVisible(object));
		// 旧的下钻分组决定「从多厚」开始压缩新层级（fromDepth）
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
				// 描边、线与业务图层元素的可见性归图层开关管，过渡结束后不强行改回
				if (
					child.name === "ChinaGlowingBoundary" ||
					child instanceof Line ||
					child.userData.blueLayer
				)
					outgoingAccents.push({ object: child, visible: child.visible });
				// 整组抬到 50：让旧画面整体绘制在新画面之后，叠加时以旧画面为准
				if (child instanceof Group) {
					groupOrders.push({ group: child, order: child.renderOrder });
					child.renderOrder = 50;
				}
				// 地名的位置由 frame 每帧投影写入，过渡期间要被冻结（frame 会查这个集合）
				if (child.userData.mapName || child instanceof Sprite)
					frozenLabels.add(child);
			});
		}
		const outgoingMap = new Group();
		const outgoingWorld = new Group();
		for (const group of [outgoingMap, outgoingWorld]) {
			group.renderOrder = 50;
			// 标记为过渡组：showRegion 隐藏底图、goBack 收集淡入对象时都会跳过它们
			group.userData.outgoingRegion = true;
		}
		this.context.china.map.add(outgoingMap);
		this.context.china.root.add(outgoingWorld);
		outgoingMap.add(...mapObjects);
		outgoingWorld.add(...worldObjects);
		// 旧地理用独立深度缓冲叠加在新地理之上，真实顶面与侧墙之间的遮挡关系才不会丢失
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
		// 排在所有对象之前绘制，onBeforeRender 里清一次深度，相当于给旧画面开一层新深度
		depthBoundary.renderOrder = -1000;
		depthBoundary.onBeforeRender = (renderer) => renderer.clearDepth();
		outgoingMap.add(depthBoundary);
		// 一次性记录本次过渡的全部基准值：进入新层级前，这些值就是 finish 的还原依据
		this.current = {
			outgoing: [outgoingMap, outgoingWorld],
			outgoingAccents,
			saved,
			// 旧的 drilldown 分组在 finish 时直接 dispose，不再还回父节点
			retired: new Set(
				mapObjects.filter((object) => object.userData.drilldown),
			),
			incoming: [],
			incomingLabels: [],
			depthObjects: [],
			// 旧层级的基面高度，是「厚度压缩」的起点；全国层没有 drilldown 分组，退回默认厚度
			fromDepth: Number(detail?.userData.baseDepth ?? CHINA_MAP_DEPTH),
			depthRatio: 1,
			depthOffset: 0,
			progress: 0,
			frozenLabels,
			groupOrders,
			// 特效组此刻的位姿：prepareIncoming 会立刻把它重置到这里，再向新位姿插值
			effectsFromPosition: this.context.mapEffects.group.position.clone(),
			effectsFromScale: this.context.mapEffects.group.scale.clone(),
		};
		for (const group of this.current.outgoing) {
			this.reveal.initialize(group, true);
			// preserveDepth 让淡出中的旧画面仍然写深度，否则侧壁会穿透新地图显示出来
			this.reveal.preserveDepth(group);
		}
	}

	/**
	 * 准备新层级：登记参与淡入的对象与标签，并按旧画面的厚度压缩新几何，
	 * 随后预编译着色器、预热贴图，确保飞行第一帧不掉帧。
	 * @param objects 新层级的根对象（通常是 showRegion 里的 group 与各业务图层）
	 * @param labels 需要随新层级一起淡入的标签
	 * @param depth 新层级的基面高度（世界坐标）
	 */
	prepareIncoming(objects: Object3D[], labels: Object3D[], depth: number) {
		const transition = this.current;
		// 没有先调用 retainOutgoing 就没有过渡可接，直接忽略
		if (!transition) return;
		transition.incoming = objects;
		transition.incomingLabels = labels;
		// 压缩比上限 2：再大的比值会让小区县的墙体被拉成柱子
		transition.depthRatio = Math.min(
			2,
			transition.fromDepth / Math.max(depth, 0.000001),
		);
		// 先补齐差值再等比压缩：镜头还在接近时，新面片不能显成一块被拉高的薄板
		transition.depthOffset = Math.max(
			0,
			transition.fromDepth - depth * transition.depthRatio,
		);
		// 只对直接挂在 map / labels / 业务图层下的对象做深度缩放，
		// 装饰物已经按层级尺寸建好，不应再被二次压缩
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
		// 标签初始完全透明，等飞行推进到对应窗口再抬起
		for (const label of labels) this.reveal.setProgress(label, 0);
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ * transition.depthRatio;
			if (object.parent === this.context.china.map)
				object.position.z = positionZ + transition.depthOffset;
		}
		// showRegion 已把特效组改成新层级的位置/尺寸，这里先记下目标、再强制回起点，
		// 后续由 advance 逐帧插值，否则切换瞬间特效会先「跳」到新位置
		transition.effectsToPosition =
			this.context.mapEffects.group.position.clone();
		transition.effectsToScale = this.context.mapEffects.group.scale.clone();
		this.context.mapEffects.group.position.copy(transition.effectsFromPosition);
		this.context.mapEffects.group.scale.copy(transition.effectsFromScale);
		this.context.mapEffects.cancelExit();
		this.context.callbacks.onLabelsReady();
		this.context.layerMotion.update();
		// 飞行开始前先上传贴图、编译着色器：否则首帧会集中上传，出现可见的卡顿
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
		// 用 1×1 的离屏目标真正走一遍绘制：compile 不触发纹理采样与状态切换，
		// 只有实际 render 才能把 GPU 侧的准备工作全部做完
		const previousTarget = this.context.renderer.getRenderTarget();
		const warmTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
		try {
			this.context.renderer.setRenderTarget(warmTarget);
			this.context.renderer.render(this.context.scene, this.context.camera);
		} finally {
			// 必须恢复调用前的渲染目标并释放临时目标，否则后续主循环会画到错误的纹理上
			this.context.renderer.setRenderTarget(previousTarget);
			warmTarget.dispose();
		}
		// 预热渲染会让对象以当前进度提交一次，这里再压回 0，保证正式飞行从全透明开始
		for (const object of objects) this.reveal.setProgress(object, 0);
	}

	/**
	 * 收尾：还原渲染顺序与厚度、归还仍要保留的对象、释放旧几何，并恢复特效组位姿。
	 * @param runPending 是否执行过渡期间积压的返回请求；只有飞行正常走完才传 true，
	 * 被强制中断（切视图、重新下钻）时传 false，避免把用户早已取消的返回补执行一次
	 */
	finish(runPending = false) {
		const transition = this.current;
		if (!transition) return;
		// 先置空：下面的 dispose/goBack 可能间接触发新的过渡，不能让它们复用旧快照
		this.current = undefined;
		for (const { group, order } of transition.groupOrders)
			group.renderOrder = order;
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ;
			object.position.z = positionZ;
		}
		// 释放 reveal 对这些对象的材质绑定，否则下次过渡会沿用旧的进度值
		for (const root of [...transition.outgoing, ...transition.incoming])
			this.reveal.forget(root);
		for (const { object, visible } of transition.outgoingAccents) {
			// 归图层开关管理的元素保持当前可见性，只有装饰性描边才恢复过渡前的状态
			if (!object.userData.blueLayer) object.visible = visible;
		}
		for (const { object, parent } of transition.saved) {
			if (transition.retired.has(object)) {
				// 旧的 drilldown 分组：几何与材质都已无用，直接释放
				this.context.callbacks.disposeObject(object as Group);
				object.removeFromParent();
				continue;
			}
			parent.add(object);
			// 已在下钻层时，全国底图与背景要让位；选中区域为空才恢复显示
			if (
				parent === this.context.china.map ||
				object === this.context.china.labels ||
				object === this.context.china.background ||
				object === this.context.china.orbitRing
			)
				object.visible = !this.context.callbacks.getSelectedRegion();
			// 全国级业务图层同理：下钻层用的是自己的一套 drilledLayers
			if (
				Object.values(this.context.china.layers).includes(object as Group) &&
				this.context.callbacks.getSelectedRegion()
			)
				object.removeFromParent();
		}
		// 过渡分组本身及其中的深度挡板、残留对象统一释放
		for (const root of transition.outgoing) {
			this.context.callbacks.disposeObject(root);
			root.removeFromParent();
		}
		// 特效组最终落到新层级的目标位姿（飞行途中一直由 advance 插值）
		if (transition.effectsToPosition)
			this.context.mapEffects.group.position.copy(transition.effectsToPosition);
		if (transition.effectsToScale)
			this.context.mapEffects.group.scale.copy(transition.effectsToScale);
		// 延迟的返回只在这里补执行一次，防止连点返回跳过中间层级
		const goBack = this.pendingBack;
		this.pendingBack = false;
		if (runPending && goBack && !this.context.callbacks.isDestroyed())
			this.context.callbacks.goBack();
	}

	/**
	 * 按飞行进度推进交叉淡出与厚度还原，由 camera-motion 的时间线逐帧调用。
	 * @param transition 本次过渡的状态快照
	 * @param time 飞行的线性进度 0~1，直接决定各元素的淡入淡出窗口
	 * @param progress 已缓动过的进度 0~1，用于厚度与特效插值，使节奏与镜头运动一致
	 */
	advance(
		transition: RegionGeometryTransition,
		time: number,
		progress: number,
	) {
		// progress 字段供外部（如大屏状态面板）读取当前过渡完成度
		transition.progress = time;
		// 旧画面在 0.28~0.96 之间退场：先让镜头贴近一点再消失，避免起手就露出空场
		const reveal = smoothProgress((time - 0.28) / 0.68);
		for (const root of transition.outgoing)
			this.reveal.setProgress(root, 1 - reveal);
		// 描边、线框在 0.05~0.62 更早退场，否则会在空中残留成一层网格
		for (const { object } of transition.outgoingAccents)
			this.reveal.setProgress(object, 1 - smoothProgress((time - 0.05) / 0.57));
		// 新画面在 0.08~0.76 淡入；标签更晚（0.18~0.90），等几何站稳再出现
		for (const root of transition.incoming)
			this.reveal.setProgress(root, smoothProgress((time - 0.08) / 0.68));
		for (const root of transition.incomingLabels)
			this.reveal.setProgress(root, smoothProgress((time - 0.18) / 0.72));
		// 厚度从压缩比逐渐恢复到 1：视觉上新层级是「长」到真实厚度的，而不是突然变厚
		const depthScale = transition.depthRatio ** (1 - progress);
		for (const { object, scaleZ, positionZ } of transition.depthObjects) {
			object.scale.z = scaleZ * depthScale;
			if (object.parent === this.context.china.map)
				object.position.z = positionZ + transition.depthOffset * (1 - progress);
		}
		// 特效组在两个层级的位姿之间线性插值，与地图主体的移动保持同步
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

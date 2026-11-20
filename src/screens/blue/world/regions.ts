/**
 * 行政区下钻导航：维护「全国 → 省 → 市 → 区县」的层级栈与镜头姿态栈，
 * 负责下钻/返回时的数据加载、旧地图冻结与新地图构建，并把相机飞行交给 CameraMotion。
 * 由 BlueWorld 的 regions 控制器对交互层与侧边按钮暴露；过渡动画细节在 region-transition.ts。
 */
import {
	ExtrudeGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	type ShaderMaterial,
	ShapeGeometry,
	Vector3,
} from "three";
import { CHINA_MAP_DEPTH } from "./constants";
import type { WorldControllers } from "./controller-types";
import { polygonsOf } from "./geometry";
import type WorldState from "./state";
import type { Layer, MapCameraPose, MapFeature } from "./types";

/**
 * 下钻所需的上下文切片：只列出本类真正读写的 WorldState 字段，
 * 避免把整个状态类作为依赖传入，也便于测试时构造替身。
 */
interface RegionNavigationContext {
	/** 层级栈、图层容器、相机位姿等共享状态，字段含义见 WorldState 对应成员 */
	state: Pick<
		WorldState,
		| "abortController"
		| "callbacks"
		| "cameraPitch"
		| "chinaData"
		| "chinaScene"
		| "cityDataCache"
		| "destroyed"
		| "detailHomeTarget"
		| "detailLoading"
		| "detailMeshes"
		| "detailTimeline"
		| "detailZoom"
		| "drillPath"
		| "drillViews"
		| "drilledLabels"
		| "drilledLayers"
		| "drilledPoints"
		| "geometry"
		| "globeScene"
		| "labelTween"
		| "layerEnabled"
		| "layerMotion"
		| "mapEffects"
		| "mapLabelOpacity"
		| "mapRotation"
		| "regionGeometry"
		| "regionRequest"
		| "requestedView"
		| "selectedRegion"
		| "switchingView"
		| "topView"
		| "transitionTimeline"
		| "view"
	>;
	/** 延迟取控制器：构造期控制器尚未建成，只能在方法执行时再调用，避免循环依赖 */
	controllers: () => Pick<
		WorldControllers,
		| "camera"
		| "cameraMotion"
		| "frame"
		| "interaction"
		| "resources"
		| "subdivisions"
		| "view"
	>;
}

/**
 * 把行政区全名压成可比较的短名，让「广东省」「广东」两种写法都能命中同一块网格。
 * 依次剥掉自治区/特别行政区的全称后缀，最后去掉结尾的「省」「市」；
 * 直辖市的名称本身不含这些后缀，因此会原样保留。
 */
const shortName = (name: string) =>
	name
		.replace("维吾尔自治区", "")
		.replace("壮族自治区", "")
		.replace("回族自治区", "")
		.replace("自治区", "")
		.replace("特别行政区", "")
		.replace(/[省市]$/, "");

/**
 * 行政区下钻控制器。
 * 层级由 drillPath 表达：空数组是全国，[省] 是省视图，[省, 市] 是市视图，
 * 栈里存的是「已进入的区域」，栈顶即当前层级；返回到更上一级时用 at(-2) 取父级。
 * drillViews 与 drillPath 严格同深：每进入一级前压入当时的镜头位姿，返回时成对弹出。
 * 直辖市与港澳的 GeoJSON 把区县直接挂在省级要素下（childrenNum 即下一级数量），
 * 所以下钻逻辑只认 childrenNum 与 adcode，不需要为它们写单独分支。
 */
export default class RegionNavigation {
	constructor(private readonly context: RegionNavigationContext) {}

	/**
	 * 一次性恢复到全国层级：清掉层级栈、下钻产物与镜头基准，
	 * 并把先前被摘走的业务图层重新挂回场景根，供后续下钻再次使用。
	 * 视图切换（WorldView.applyView）与返回到顶层时调用，不播放过渡动画。
	 */
	clearSubdivisions() {
		this.clearDetailGeometry();
		this.context.state.selectedRegion = undefined;
		this.context.state.drillPath.length = 0;
		this.context.state.drillViews.length = 0;
		this.context.state.detailZoom = 1;
		// 特效区域重置为整幅中国地图：宽 15 世界单位、基面高度取省级厚度
		this.context.state.mapEffects.setRegion(0, 0, 15, CHINA_MAP_DEPTH);
		// showRegion 会把底图块与图层摘出可见集合，这里逐项恢复，避免返回后地图只剩空场景
		this.context.state.chinaScene.map.children.forEach((child) => {
			child.visible = true;
		});
		Object.values(this.context.state.chinaScene.layers).forEach((group) => {
			this.context.state.chinaScene.root.add(group);
		});
		this.context.state.callbacks.onDrillChange?.([]);
	}

	/**
	 * 返回上一级：弹出层级与镜头姿态，旧地图由过渡器冻结后淡出，新地图淡入。
	 * 若边界过渡尚未结束，只置 pendingBack 并立即返回，等过渡收尾时再执行，
	 * 这样连点返回不会把层级一次弹出好几级。
	 */
	goBack() {
		// 视图切换中或已在顶层时，返回没有意义
		if (
			!this.context.state.drillPath.length ||
			this.context.state.switchingView
		)
			return;
		// 过渡进行中：延迟到 RegionTransition.finish(true) 里再走一次
		if (this.context.state.regionGeometry.current) {
			this.context.state.regionGeometry.pendingBack = true;
			return;
		}
		// 作废在途的行政区请求，避免旧请求回来后把刚返回的层级又推进去
		this.context.state.regionRequest++;
		this.context.state.detailLoading = false;
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		const fromPose = this.context.controllers().camera.getMapCameraPose();
		this.context.state.regionGeometry.retainOutgoing();
		const returnPose = this.context.state.drillViews.pop();
		this.context.state.drillPath.pop();
		const parent = this.context.state.drillPath.at(-1);
		if (parent) {
			this.showRegion(parent, returnPose);
		} else {
			// 已回到全国：底图块仍在场景里，只需恢复可见性并让镜头飞回中国归位点
			this.context.controllers().view.applyView("china");
			this.context.state.requestedView = "china";
			this.context.controllers().camera.restoreMapCameraPose(fromPose);
			this.context.state.regionGeometry.prepareIncoming(
				[
					// 排除被冻结的旧几何（outgoingRegion）与特效组，其余底图对象参与淡入
					...this.context.state.chinaScene.map.children.filter(
						(object) =>
							!object.userData.outgoingRegion &&
							object !== this.context.state.mapEffects.group,
					),
					this.context.state.chinaScene.labels,
					this.context.state.chinaScene.background,
					this.context.state.chinaScene.orbitRing,
					...Object.values(this.context.state.chinaScene.layers),
				],
				[
					this.context.state.chinaScene.labels,
					...Object.values(this.context.state.chinaScene.layers),
				],
				CHINA_MAP_DEPTH,
			);
			// 全国视图的固定归位点与基准倍率，与 applyView 中的 target 保持一致
			this.context
				.controllers()
				.cameraMotion.transitionRegionCamera(
					new Vector3(0.35, 0, 0),
					1,
					returnPose,
				);
		}
	}

	/**
	 * 按名称或 adcode 命中当前可见网格并进入下一级。
	 * 匹配优先级为：adcode 精确相等 → 完整名称 → 去掉行政区后缀的短名，
	 * 以兼容侧边栏传「广东」而要素名为「广东省」的情况。
	 * @param name 区域名称或国家行政区划代码
	 */
	drilldown(name: string | number) {
		// 视图切换、数据加载中或边界过渡未结束时不接受新的下钻（防止层级栈错位）
		if (
			this.context.state.switchingView ||
			this.context.state.detailLoading ||
			this.context.state.regionGeometry.current
		)
			return;
		// 已在下钻层就只在子级网格里找，否则在全国省级网格里找
		const candidates = this.context.state.drillPath.length
			? this.context.state.detailMeshes
			: this.context.state.chinaScene.regionMeshes;
		const mesh = candidates.find(
			(region) =>
				this.context.controllers().interaction.isVisible(region) &&
				(Number(region.userData.feature?.properties?.adcode) === Number(name) ||
					region.userData.name === name ||
					shortName(region.userData.name) === shortName(String(name))),
		);
		if (!mesh) return;
		const feature = mesh.userData.feature as MapFeature;
		// 重复点击同一区域会让层级栈出现两条相同记录，返回时看似「点不动」
		if (
			this.context.state.drillPath.at(-1)?.properties?.adcode ===
			feature.properties?.adcode
		)
			return;
		void this.enterRegion(feature);
	}

	/**
	 * 进入某个区域：按需拉取它的下一级 GeoJSON，成功后冻结旧地图并重建新层级。
	 * 若目标没有下级（childrenNum 为 0）或数据已在缓存中，则跳过网络请求直接切换。
	 * @param feature 目标区域要素，properties.adcode 为区划代码
	 */
	async enterRegion(feature: MapFeature) {
		// 令牌在 await 前后比对：期间若用户返回或切换视图，本次结果直接丢弃
		const request = ++this.context.state.regionRequest;
		const adcode = Number(feature.properties?.adcode);
		this.context.state.detailLoading = true;
		try {
			if (
				adcode &&
				Number(feature.properties?.childrenNum) > 0 &&
				!this.context.state.cityDataCache.has(adcode)
			) {
				const response = await fetch(
					`${import.meta.env.BASE_URL}geojson/blue/${adcode}.json`,
					{ signal: this.context.state.abortController.signal },
				);
				if (response.ok)
					this.context.state.cityDataCache.set(adcode, await response.json());
			}
		} catch (error) {
			// 组件卸载会 abort 在途请求，AbortError 属于正常流程，不打印
			if (
				!this.context.state.destroyed &&
				(error as Error).name !== "AbortError"
			)
				console.error("行政区划读取失败", error);
		}
		if (
			this.context.state.destroyed ||
			request !== this.context.state.regionRequest ||
			this.context.state.view !== "china"
		)
			return;
		this.context.state.detailLoading = false;
		this.context.controllers().cameraMotion.stopCameraControls();
		this.context.state.transitionTimeline?.kill();
		// 先记录进入前的位姿，再冻结旧几何，最后才把新层级压栈，三者顺序不可换
		this.context.state.drillViews.push(
			this.context.controllers().camera.getMapCameraPose(),
		);
		this.context.state.regionGeometry.retainOutgoing();
		this.context.state.drillPath.push(feature);
		this.showRegion(feature);
	}

	/**
	 * 清空上一层的下钻产物：关闭监测点与悬停、终止入场时间线，
	 * 逐个 dispose 并移除带 drilldown 标记的分组，最后释放 drilled* 引用。
	 * 由 showRegion 与 clearSubdivisions 调用，自身不触发任何镜头或视图变化。
	 */
	clearDetailGeometry() {
		this.context.controllers().interaction.closeMonitoringPoint();
		this.context.state.detailLoading = false;
		this.context.controllers().interaction.setHovered(undefined);
		this.context.state.detailTimeline?.kill();
		this.context.state.detailTimeline = undefined;
		this.context.state.detailMeshes.length = 0;
		// 遍历副本：remove 会改动 children，直接遍历原数组会跳过元素
		for (const child of [...this.context.state.chinaScene.map.children]) {
			if (!child.userData.drilldown) continue;
			this.context.controllers().resources.disposeObject(child);
			this.context.state.chinaScene.map.remove(child);
		}
		this.context.state.drilledLabels = undefined;
		this.context.state.drilledPoints = undefined;
		this.context.state.drilledLayers = {};
	}

	/**
	 * 构建某一级的完整展示：拉伸主体、周边地区剪影、地名、业务图层与镜头飞行。
	 * 进入与返回共用此方法，区别只在 returnPose：返回时用它还原上一级的视角，
	 * 进入新层级时则由 fitRegionZoom 根据轮廓尺寸算出合适的缩放与目标点。
	 * @param feature 要展示的区域要素
	 * @param returnPose 返回上级时的目标镜头位姿；下钻时为空
	 */
	showRegion(feature: MapFeature, returnPose?: MapCameraPose) {
		this.context.controllers().cameraMotion.stopCameraControls();
		const fromPose = this.context.controllers().camera.getMapCameraPose();
		this.context.state.transitionTimeline?.kill();
		// 地名在飞行起始即淡出：它们属于上一层的空间语义，等新层级就位后再统一抬起
		this.context.state.labelTween?.kill();
		if (!this.context.state.regionGeometry.current)
			this.context.state.mapLabelOpacity = 0;
		this.clearDetailGeometry();
		this.context.state.selectedRegion = String(feature.properties?.name);
		this.context.state.view = "china";
		this.context.state.mapRotation = 0;
		this.context.state.topView = false;
		// 下钻后统一回到 0.72 rad 的斜俯视，保证每一级入场画面可预期
		this.context.state.cameraPitch = 0.72;
		this.context.controllers().camera.updateMapRotation();
		this.context.state.globeScene.root.visible = false;
		this.context.state.chinaScene.map.visible = true;
		if (!this.context.state.regionGeometry.current)
			this.context.state.chinaScene.labels.visible =
				this.context.state.chinaScene.background.visible =
				this.context.state.chinaScene.orbitRing.visible =
					false;
		// 全国级业务图层从根节点摘下：下钻层用自己的一套 drilledLayers，避免新旧叠加
		Object.values(this.context.state.chinaScene.layers).forEach((layer) => {
			this.context.state.chinaScene.root.remove(layer);
		});
		// 旧地图块隐藏但保留对象，真正负责淡出的是仅保留 old 几何的过渡组
		this.context.state.chinaScene.map.children.forEach((child) => {
			if (!child.userData.outgoingRegion) child.visible = false;
		});
		const group = new Group();
		group.userData.drilldown = true;
		const coordinates = polygonsOf(feature).flatMap((polygon) =>
			polygon[0].map((coordinate) =>
				this.context.state.geometry.point([coordinate[0], coordinate[1]]),
			),
		);
		const rawWidth =
			Math.max(...coordinates.map((point) => point.x)) -
			Math.min(...coordinates.map((point) => point.x));
		const rawHeight =
			Math.max(...coordinates.map((point) => point.y)) -
			Math.min(...coordinates.map((point) => point.y));
		// 轮廓简化阈值随区域跨度收缩：区域越小保留越多顶点，大范围才放宽以提高性能
		const precision = 0.004 * Math.min(1, Math.max(rawWidth, rawHeight) / 7.5);
		const mesh = new Mesh(
			new ExtrudeGeometry(
				this.context.state.geometry.shapes(feature, precision),
				{
					depth: CHINA_MAP_DEPTH,
					bevelEnabled: false,
					curveSegments: 1,
				},
			),
			[
				// 顶面与侧面分开材质：顶面走带网格/渐变的 shader，侧面走统一的墙体 shader
				this.context.state.geometry.topMaterial(undefined, undefined, true),
				this.context.state.geometry.sideMaterial(),
			],
		);
		mesh.userData = {
			name: this.context.state.selectedRegion,
			feature,
			top: mesh.material[0],
		};
		group.add(mesh);
		// 每个下钻层重建一套业务图层容器，key 与 layerEnabled 一一对应；
		// initialize 会记录初始显隐，使关闭状态的图层连材质都不参与绘制
		this.context.state.drilledLabels = new Group();
		this.context.state.drilledPoints = new Group();
		this.context.state.drilledLayers = {
			label: this.context.state.drilledLabels,
			point: this.context.state.drilledPoints,
			flyline: new Group(),
			scatter: new Group(),
			heat: new Group(),
		};
		for (const [id, layer] of Object.entries(
			this.context.state.drilledLayers,
		)) {
			layer.userData.blueLayer = id;
			this.context.state.layerMotion.initialize(
				layer,
				this.context.state.layerEnabled[id as Layer],
			);
			group.add(layer);
		}
		this.context.state.chinaScene.map.add(group);
		mesh.geometry.computeBoundingBox();
		const bounds = mesh.geometry.boundingBox;
		if (!bounds) return;
		const center = bounds.getCenter(new Vector3());
		const size = bounds.getSize(new Vector3());
		// 地图平面 y 方向在视觉上是纵深，按 0.75 折算后与横向比较，避免狭长区域过度缩放
		const span = Math.max(size.x, size.y * 0.75, 0.000001);
		// 以 7.5 世界单位作为「满屏跨度」：大于它的区域不再缩小，小于它的按比例收薄
		const spatialScale = Math.min(1, span / 7.5);
		const baseDepth = CHINA_MAP_DEPTH * spatialScale;
		// 侧壁 shader 用 wallScale 算墙体渐变，必须与几何的 scale.z 严格同步，否则明暗断层
		(mesh.material[1] as ShaderMaterial).uniforms.wallScale.value =
			spatialScale;
		mesh.scale.z = spatialScale;
		// 地图平面绕 x 轴转了 -90°，平面 y 对应场景 -z；目标点抬到基面厚度的 0.6 倍，仍低于挤出顶面
		const nextTarget = new Vector3(
			center.x,
			this.context.state.chinaScene.map.position.y + baseDepth * 0.6,
			-center.y,
		);
		// 用二分法把真实轮廓（含抬升后的顶面）拟合进画面中央，返回该层的基准缩放
		const nextZoom = this.context
			.controllers()
			.camera.fitRegionZoom(mesh, nextTarget, spatialScale, span);
		group.userData.spatialScale = spatialScale;
		group.userData.baseDepth = baseDepth;
		group.userData.materialBounds = new Vector3(
			bounds.min.x,
			bounds.min.y,
			Math.max(size.x, size.y),
		);
		// 顶面 shader 需要包围盒才能让网格线随区域尺寸自适应，不会在小区域上过密
		(mesh.userData.top as ShaderMaterial).uniforms.mapBounds.value.copy(
			group.userData.materialBounds,
		);
		// 边界光带留引用给悬停高亮，避免每帧再遍历查找
		group.userData.boundary = this.context.state.chinaScene.createBorderGlow(
			feature,
			group,
			baseDepth,
			spatialScale,
		);
		// 描边只贴在层级基面上方 0.006（随层级缩放）以避免与基面共面，挤出顶面仍在其上方很远
		this.context.state.geometry.lines(
			feature,
			group,
			0.006 * spatialScale,
			"#c29a62",
			0.64,
			true,
			spatialScale,
		);

		// 有下级的区域顶面还套着一圈描边（+0.006），特效平面要与之齐平，否则光晕被棱线切开
		this.context.state.mapEffects.setRegion(
			center.x,
			center.y,
			Math.max(size.x, size.y),
			baseDepth +
				(Number(feature.properties?.childrenNum) > 0
					? 0.006 * spatialScale
					: 0),
		);
		this.context.state.mapEffects.group.visible = true;
		group.userData.materialHeight = size.y;
		(mesh.userData.top as ShaderMaterial).uniforms.mapHeight.value = size.y;
		// 兄弟区域取自父级数据：省级看全国、市级看省、区县看市，没有父级时只有全国
		const parentCode = Number(
			this.context.state.drillPath.at(-2)?.properties?.adcode,
		);
		const neighbours = parentCode
			? this.context.state.cityDataCache.get(parentCode)
			: this.context.state.chinaData;
		for (const neighbour of neighbours?.features ?? []) {
			if (neighbour.properties?.adcode === feature.properties?.adcode) continue;
			// 兄弟区域只画一层薄片并压低到主体之下，作为「仍在同一层级」的空间参照
			const context = new Mesh(
				new ShapeGeometry(
					this.context.state.geometry.shapes(neighbour, precision),
				),
				this.context.state.geometry.contextMaterial(
					new MeshBasicMaterial({
						color: "#10253b",
						transparent: true,
						opacity: 0.32,
						depthWrite: false,
					}),
				),
			);
			context.position.z = -0.07 * spatialScale;
			group.add(context);
			// context=true 让描边接入 contextMaterial，在屏幕边缘按 shader 淡出，不抢主体焦点
			this.context.state.geometry.lines(
				neighbour,
				group,
				-0.06 * spatialScale,
				"#507d9c",
				0.58,
				true,
				spatialScale,
				true,
			);
			const neighbourCenter = (neighbour.properties?.centroid ??
				neighbour.properties?.center) as [number, number] | undefined;
			if (neighbourCenter && neighbour.properties?.name) {
				// variant "context" 走更暗的配色，12px 是底衬地名的固定字号
				this.context.state.drilledLabels.add(
					this.context
						.controllers()
						.frame.mapName(
							String(neighbour.properties.name),
							this.context.state.geometry.point(
								neighbourCenter,
								-0.04 * spatialScale,
							),
							false,
							12,
							"context",
						),
				);
			}
		}
		this.context.state.detailZoom = nextZoom;
		this.context.state.detailHomeTarget.copy(nextTarget);
		// 焦点抬到顶面之上 0.24×spatialScale（约半个厚度），散点与飞线从这里发散
		group.userData.focus = new Vector3(
			nextTarget.x,
			-nextTarget.z,
			baseDepth + 0.24 * spatialScale,
		);
		this.context
			.controllers()
			.subdivisions.createDetailOverlays(
				feature,
				group,
				spatialScale,
				baseDepth,
			);
		// 先保持相机当前角度，稍后由同一次飞行动画把它带到拟合后的视角，避免起手跳帧
		this.context.controllers().camera.restoreMapCameraPose(fromPose);
		const adcode = Number(feature.properties?.adcode);
		const hasChildren = Number(feature.properties?.childrenNum) > 0;
		if (adcode && hasChildren && this.context.state.cityDataCache.has(adcode)) {
			// 数据已在 enterRegion 中拉到：交给 subdivisions 生成子级与子级地名
			void this.context
				.controllers()
				.subdivisions.loadSubdivisions(
					adcode,
					this.context.state.selectedRegion,
					group,
					false,
				);
		} else {
			// 叶子节点（区县，或无下级数据）只给当前区域挂一个标题式地名
			const label = this.context
				.controllers()
				.frame.mapName(
					this.context.state.selectedRegion,
					new Vector3(center.x, center.y, baseDepth + 0.018 * spatialScale),
					true,
				);
			this.context.state.drilledLabels.add(label);
		}
		// 参数依次是：参与淡入的新几何、随几何一起淡入的标签、该层的基面高度
		this.context.state.regionGeometry.prepareIncoming(
			[group],
			Object.values(this.context.state.drilledLayers),
			baseDepth,
		);
		this.context
			.controllers()
			.cameraMotion.transitionRegionCamera(nextTarget, nextZoom, returnPose);
		// 面包屑只拿中文名，层级判断由 drillPath 的 adcode 负责
		this.context.state.callbacks.onDrillChange?.(
			this.context.state.drillPath.map((item) => String(item.properties?.name)),
		);
	}
}

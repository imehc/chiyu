/**
 * 行政区下钻的细节层：为当前选中的省/市拉取下一级 GeoJSON，生成拉伸面、描边、名称标签，
 * 并在其上叠加飞线、散点、信息点与热力装饰，用一条 gsap 时间线做错峰入场。
 * 由 regions 控制器在下钻完成后调用，与 ChinaScene 的 map 分组协同；数据缓存在 WorldState.cityDataCache。
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import gsap from "gsap";
import {
	ExtrudeGeometry,
	type Group,
	Mesh,
	QuadraticBezierCurve3,
	type Vector3,
} from "three";
import { CHINA_MAP_DEPTH } from "./constants";
import type { WorldControllers } from "./controller-types";
import type WorldState from "./state";
import type { MapFeature } from "./types";

/**
 * 下钻所需的上下文切片：只挑 WorldState 中被本类真正读写的字段，
 * 避免把整个状态类作为依赖传入，也方便调用方按需构造测试替身。
 */
interface SubdivisionsContext {
	/** 下钻过程中会读写的共享状态，字段含义见 WorldState 对应成员 */
	state: Pick<
		WorldState,
		| "abortController"
		| "chinaScene"
		| "cityDataCache"
		| "destroyed"
		| "detailLoading"
		| "detailMeshes"
		| "detailTimeline"
		| "detailZoom"
		| "drilledLabels"
		| "drilledLayers"
		| "drilledPoints"
		| "geometry"
		| "mapEffects"
		| "overlays"
		| "reducedMotion"
		| "selectedRegion"
	>;
	/** 延迟取控制器：构造期控制器尚未建成，只能在真正需要时再调用，避免循环依赖 */
	controllers: () => Pick<WorldControllers, "frame">;
}

/**
 * 行政区下钻细节构建器。
 * 实例本身无状态，所有缓存、加载标记与产物都寄存在 WorldState 上，便于返回上级时统一清理。
 */
export default class Subdivisions {
	constructor(private readonly context: SubdivisionsContext) {}

	/**
	 * 为已下钻的区域补充焦点圈、散点、信息点、飞线与热力面。
	 * @param feature 当前区域的要素，用于按边界采样装饰点
	 * @param group 该区域的容器分组，装饰物会挂到 drilledLayers 并跟随此分组的层级
	 * @param scale 当前层级的空间缩放系数，装饰尺寸与高度均需乘以它
	 * @param depth 当前层级的基面高度（世界坐标）
	 */
	createDetailOverlays(
		feature: MapFeature,
		group: Group,
		scale: number,
		depth: number,
	) {
		// 在当前层级基面之上 0.045×scale 处撒点：抬高量随层级收缩，保证各层装饰都浮在面片之上
		const samples = this.context.state.geometry.sampleMap(
			feature,
			38,
			depth + 0.045 * scale,
		);
		if (!samples.length) return;
		// 期望焦点来自上层（通常是父级的点击位置）；这里换成离它最近的采样点，
		// 既保留点击位置语义，又保证焦点真正落在多边形内部
		const desiredFocus = group.userData.focus as Vector3;
		const focus = samples
			.reduce((best, point) =>
				point.distanceTo(desiredFocus) < best.distanceTo(desiredFocus)
					? point
					: best,
			)
			.clone();
		// 回写到 group.userData，供返回上级或再次下钻时复用同一个焦点位置
		group.userData.focus = focus;
		this.context.state.drilledLayers.flyline?.add(
			this.context.state.mapEffects.focus(focus, scale),
		);
		// 38 个采样点全部撒散点，但只有前 6 个挂信息点与飞线，避免小区域被元素塞满
		samples.forEach((point, index) => {
			this.context.state.drilledLayers.scatter?.add(
				this.context.state.mapEffects.scatter(
					point,
					(0.1 + (index % 3) * 0.025) * scale,
				),
			);

			if (index >= 6) return;
			const info = this.context.state.mapEffects.info(point, index, scale);
			this.context.state.drilledPoints?.add(info.group, info.marker);
			// 每颗信息点都要交给 ChinaScene 记录，控制器靠这份列表做屏幕投影与销毁
			this.context.state.chinaScene.monitoringMarkers.push(info.marker);
			// 焦点附近的点距离太短，飞线会缩成一个亮点，直接跳过
			if (focus.distanceTo(point) < 0.3 * scale) return;
			const middle = focus.clone().lerp(point, 0.5);
			// 中点抬升「距离的 30%、最少 0.4×scale」，比例比省级飞线（22%）更大，下钻层拱形更明显
			middle.z += Math.max(focus.distanceTo(point) * 0.3, 0.4 * scale);
			this.context.state.drilledLayers.flyline?.add(
				this.context.state.mapEffects.flyline(
					new QuadraticBezierCurve3(focus, middle, point),
					scale,
					index,
				),
			);
		});
		// 热力只取前 10 个采样点：既覆盖整块区域，又限制叠加层数与加法混合的填充开销
		this.context.state.drilledLayers.heat?.add(
			this.context.state.overlays.createHeatSurface(
				samples.slice(0, 10).map((point, index) => ({
					position: point.clone().setZ(depth + 0.018 * scale),
					size: (1.35 + (index % 3) * 0.24) * scale,
					intensity: 0.62 + (index % 4) * 0.12,
				})),
			),
		);
		// 告警点取第 10~13 个采样点；规模压到 min(scale, 1/detailZoom)，放大视角后不会撑满屏幕
		if (this.context.state.drilledPoints)
			this.context.state.overlays.createAlertPoints(
				this.context.state.drilledPoints,
				samples.slice(10, 14),
				Math.min(scale, 1 / this.context.state.detailZoom),
			);
	}

	/**
	 * 加载并绘制下一级行政区划。
	 * @param adcode 国家标准行政区划代码，同时充当缓存 key（如 440000 对应广东省）
	 * @param name 区域名称，用于校验异步返回时用户是否仍停留在同一层级
	 * @param group 当前层级的容器分组，新要素与描边直接挂到它下面
	 * @param animate 是否播放入场动画；系统偏好「减少动态效果」时自动退化为瞬时完成
	 */
	async loadSubdivisions(
		adcode: number,
		name: string,
		group: Group,
		animate = true,
	) {
		// 两个来源都意味着不需要补间：用户偏好减少动效，或调用方明确要求瞬时切换
		const instant = this.context.state.reducedMotion.matches || !animate;
		try {
			let data = this.context.state.cityDataCache.get(adcode);
			if (!data) {
				// 复用全局 AbortController：返回上级或销毁时统一中断所有在途请求，避免请求堆积
				const response = await fetch(
					`${import.meta.env.BASE_URL}geojson/blue/${adcode}.json`,
					{ signal: this.context.state.abortController.signal },
				);
				// 404 等错误静默返回，保留已渲染的父级轮廓，不弹错误打断下钻
				if (!response.ok) return;
				data = (await response.json()) as FeatureCollection<
					Polygon | MultiPolygon
				>;
				// 用 adcode 作缓存 key：行政区划代码全局唯一，同一区县无论从哪条路径进入都命中同一份数据
				this.context.state.cityDataCache.set(adcode, data);
			}
			// 三重竞态检查：组件已销毁、用户已切到别的区域、或分组已被移出地图，任何一种都直接丢弃结果
			if (
				this.context.state.destroyed ||
				this.context.state.selectedRegion !== name ||
				group.parent !== this.context.state.chinaScene.map
			)
				return;
			// 时间线结束时再统一揭示地名，避免文字先于面片出现
			const detailTimeline = gsap.timeline({
				onComplete: () => this.context.controllers().frame.revealMapNames(),
			});
			this.context.state.detailTimeline = detailTimeline;
			// 父级可能已被整体缩放与抬升，子级的厚度、描边与文字都要按同一比例换算
			const spatialScale = Number(group.userData.spatialScale ?? 1);
			const baseDepth = Number(group.userData.baseDepth ?? CHINA_MAP_DEPTH);
			const detailDepth = 0.006 * spatialScale;
			const surface = baseDepth + detailDepth;
			const sideMaterial = this.context.state.geometry.sideMaterial(
				detailDepth,
				spatialScale,
			);
			const boundary = group.userData.boundary as Group;
			// 子级数据解析期间先保留父级轮廓，只把它抬到子级厚度上，避免出现空档帧
			detailTimeline.to(
				boundary.position,
				{
					z: detailDepth,
					duration: instant ? 0 : 0.65,
					ease: "sine.inOut",
				},
				0,
			);

			// 逐个要素建面：每个要素自带一个 reveal 对象，由时间线共同推进，实现同层级的同步淡入
			data.features.forEach((feature, index) => {
				const shapes = this.context.state.geometry.shapes(
					feature,
					0.012 * spatialScale,
				);
				if (!shapes.length) return;
				const reveal = { value: instant ? 1 : 0 };
				// 错峰上限 0.12 秒（每个要素 0.008 秒），要素再多也不会把入场拖长
				const revealStart = instant ? 0 : Math.min(index * 0.008, 0.12);
				const face = new Mesh(
					new ExtrudeGeometry(shapes, {
						depth: detailDepth,
						bevelEnabled: false,
						curveSegments: 1,
					}),
					[
						this.context.state.geometry.topMaterial(
							group.userData.materialBounds as Vector3,
							Number(group.userData.materialHeight),
							true,
							reveal,
						),
						sideMaterial,
					],
				);
				face.userData = {
					name: String(feature.properties?.name),
					feature,
					top: face.material[0],
				};
				// 登记到 detailMeshes，返回上级时按这份列表统一释放几何体与材质
				this.context.state.detailMeshes.push(face);
				// 半透明且不写深度：淡入过程中不会在自身上投出硬阴影，也能与描边正确叠加
				face.material[0].transparent = true;
				face.material[0].depthWrite = false;
				face.position.z = baseDepth + 0.001 * spatialScale;
				// 从 0.8 倍厚度长到 1 倍，配合透明度变化做出「从底部长出来」的效果
				face.scale.z = instant ? 1 : 0.8;
				group.add(face);
				detailTimeline.to(
					reveal,
					{
						value: 1,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				detailTimeline.to(
					face.scale,
					{
						z: 1,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				const lineMaterial = this.context.state.geometry.lines(
					feature,
					group,
					surface + 0.014 * spatialScale,
					"#c8f5ff",
					0.86,
					false,
					spatialScale,
				);
				lineMaterial.opacity = instant ? 0.86 : 0;
				detailTimeline.to(
					lineMaterial,
					{
						opacity: 0.86,
						duration: instant ? 0 : 0.65,
						ease: "sine.inOut",
					},
					revealStart,
				);
				const center = (feature.properties?.centroid ??
					feature.properties?.center) as [number, number] | undefined;
				if (!center) return;

				const label = this.context
					.controllers()
					.frame.mapName(
						String(feature.properties?.name),
						this.context.state.geometry.point(
							center,
							surface + 0.018 * spatialScale,
						),
					);
				// 把同一个 reveal 对象挂到文字上，时间线推进它时面片与名字会同步淡入，无需再建第二条补间
				label.userData.mapName.reveal = reveal;
				this.context.state.drilledLabels?.add(label);
			});
		} catch (error) {
			// AbortError 属于主动取消（返回上级或销毁场景），不算异常；其余错误只记日志，不打断交互
			if (
				!this.context.state.destroyed &&
				(error as Error).name !== "AbortError"
			)
				console.error("行政区划读取失败", error);
		} finally {
			// 只有分组仍挂在地图上才复位加载标记；已返回上级时由上层接管，避免误清掉新一轮的状态
			if (group.parent === this.context.state.chinaScene.map)
				this.context.state.detailLoading = false;
		}
	}
}

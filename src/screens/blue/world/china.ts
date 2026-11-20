/**
 * 中国地图本体：把省级 GeoJSON 拉伸成厚度为 CHINA_MAP_DEPTH 的立体块，叠加顶面 shader、
 * 描边、区域色块与省名标注，并派生周边国家剪影、监测点、散点、飞线与热力图层。
 * 由 WorldState 创建并挂到场景上，regions 与 region-transition 控制器负责下钻时替换与动画驱动。
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
	BufferGeometry,
	ExtrudeGeometry,
	Group,
	Line,
	LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	QuadraticBezierCurve3,
	ShapeGeometry,
	type Sprite,
	Vector3,
} from "three";
import chinaInfoPoints from "../../china/data/info";
import { chinaRegions } from "../../china/data/regions";
import chinaScatterPoints from "../../china/data/scatter";
import type MapEffects from "../map-effects";
import { CHINA_MAP_DEPTH } from "./constants";
import { type default as MapGeometry, polygonsOf } from "./geometry";
import type MapLabels from "./labels";
import type MapOverlays from "./overlays";
import type SceneTextures from "./textures";
import type { Layer, MapFeature } from "./types";

/**
 * 中国地图的场景构建器。
 * map 承载所有省市立体块，下钻时子级要素会直接挂到对应省份的对象下，因此 map 同时是
 * 下钻层级判断（group.parent === map）的依据。
 */
export default class ChinaScene {
	/** 地图内容根节点，所有省块与描边都挂在这里，整体旋转/升降由控制器驱动 */
	readonly map = new Group();
	/** 场景根节点，承载背景与周边国家等不随地图一起变换的内容 */
	readonly root = new Group();
	/** 全局文字标注容器（如「中国 CHINA」标题） */
	readonly labels = new Group();
	/** 业务图层容器，key 与图层开关一一对应 */
	readonly layers: Record<Layer, Group> = {
		flyline: new Group(),
		label: new Group(),
		point: new Group(),
		scatter: new Group(),
		heat: new Group(),
		region: new Group(),
		scan: new Group(),
	};
	/** 周边国家剪影容器，绕 x 轴翻转后平铺在地图下方作为环境底衬 */
	readonly surrounding = new Group();
	/** 远景轨道环容器 */
	readonly orbitRing = new Group();
	/** 背景层容器，周边国家与国名标签最终都挂到这里 */
	readonly background = new Group();
	/** 省级立体块列表，顺序即下钻索引，同时用于计算描边材质的包围盒与高度 */
	readonly regionMeshes: Mesh[] = [];
	/** 监测点标记，控制器逐帧投影屏幕坐标时读取，销毁时需要清空 */
	readonly monitoringMarkers: Sprite[] = [];

	/**
	 * @param geometry 投影与几何工具，负责 GeoJSON → Shape/顶点
	 * @param textures 贴图工厂，用于生成标题与铭牌
	 * @param overlays 热力面、告警点等体量较大的覆盖层工厂
	 * @param mapEffects 飞线、聚焦圈、散点、信息点等特效工厂
	 * @param createLabel 标注工厂（由 labels.ts 提供），延迟注入以避免直接循环依赖
	 */
	constructor(
		private readonly geometry: MapGeometry,
		private readonly textures: SceneTextures,
		private readonly overlays: MapOverlays,
		private readonly mapEffects: MapEffects,
		private readonly createLabel: MapLabels["create"],
	) {}

	/**
	 * 构建整块中国地图：省域立体块、省界描边、区域色块、省名与国界光带。
	 * @param data 省级面数据，properties.name 为省名、centroid/center 用于标注定位
	 * @param outline 国界数据，用于额外的金色描边与光晕
	 */
	createChina(
		data: FeatureCollection<Polygon | MultiPolygon>,
		outline: FeatureCollection<Polygon | MultiPolygon>,
	) {
		// 所有省份共用同一个侧壁材质实例，只需编译一次 shader，也便于统一更新 time uniform
		const sideMaterial = this.geometry.sideMaterial(CHINA_MAP_DEPTH);
		for (const feature of data.features) {
			const name = feature.properties?.name as string;
			// 无名字的要素（如零散岛礁）不做拉伸，只在地图平面上补一层细线
			if (!name) {
				this.geometry.lines(feature, this.map, 0.02, "#678dad", 0.38);
				continue;
			}
			const shapes = this.geometry.shapes(feature);
			if (!shapes.length) continue;
			// curveSegments 设为 1：轮廓已在 shapes() 里按阈值简化，再细分只会白白增加顶点
			const geometry = new ExtrudeGeometry(shapes, {
				depth: CHINA_MAP_DEPTH,
				bevelEnabled: false,
				curveSegments: 1,
			});
			const top = this.geometry.topMaterial();
			const mesh = new Mesh(geometry, [top, sideMaterial]);
			// userData 是后续射线拾取、悬停高亮与下钻取省名的唯一入口
			mesh.userData = { name, feature, top };
			this.map.add(mesh);
			this.regionMeshes.push(mesh);
			// 顶面描边比拉伸厚度高 0.006，避免与顶面共面被深度测试抹掉
			this.geometry.lines(
				feature,
				this.map,
				CHINA_MAP_DEPTH + 0.006,
				"#bfe3ff",
				0.8,
			);
			const center = (feature.properties?.centroid ??
				feature.properties?.center) as [number, number] | undefined;
			// 港澳面积过小，省名会与广东的标注挤在一起，直接跳过不画
			if (center && !["香港特别行政区", "澳门特别行政区"].includes(name)) {
				// 山西与天津的默认质心压在邻省文字上，手工挪到更空的位置，天津再用引出线连回真实中心
				const labelCenter: [number, number] =
					name === "山西省"
						? [111.0, 37.2]
						: name === "天津市"
							? [119.8, 39.7]
							: center;
				const label = this.createLabel(
					name,
					this.geometry.point(labelCenter, CHINA_MAP_DEPTH + 0.018),
					false,
					14,
				);
				this.layers.label.add(label);
				if (name === "天津市") {
					this.layers.label.add(
						new Line(
							new BufferGeometry().setFromPoints([
								this.geometry.point(center, CHINA_MAP_DEPTH + 0.06),
								this.geometry.point([118.7, 39.7], CHINA_MAP_DEPTH + 0.06),
							]),
							new LineBasicMaterial({
								color: "#8ab0cd",
								transparent: true,
								opacity: 0.38,
							}),
						),
					);
				}
			}
			// 区域色块用扁平 ShapeGeometry 贴在顶面上方 0.014 处，颜色按索引轮转 4 种，避免相邻省份同色
			const tint = new Mesh(
				new ShapeGeometry(shapes),
				new MeshBasicMaterial({
					color: ["#26628a", "#384faf", "#225981", "#276770"][
						this.regionMeshes.length % 4
					],
					transparent: true,
					opacity: 0.34,
					depthWrite: false,
				}),
			);
			tint.position.z = CHINA_MAP_DEPTH + 0.014;
			this.layers.region.add(tint);
		}
		// 国界先铺一层柔光描边，再叠一条贴底（0.006）的金色细线；低位可避免盖住省级块的顶面
		for (const feature of outline.features) {
			this.createBorderGlow(feature, this.map, CHINA_MAP_DEPTH);
			this.geometry.lines(feature, this.map, 0.006, "#c29a62", 0.64, true);
		}
		// 标题贴图 384×192 铺到 4.4×1.8，横向相对贴图有明显拉伸，摆在右下角空白区
		const title = this.textures.sprite("中国\nCHINA", {
			size: 76,
			color: "#ffffff",
			width: 384,
			height: 192,
			bold: true,
		});
		title.scale.set(4.4, 1.8, 1);
		title.position.set(6.27, -6.35, 0.78);
		this.labels.add(title);
	}

	/**
	 * 为一块面要素生成边界光晕。
	 * @param feature 要素，取每个多边形的外环
	 * @param parent 光晕挂载的父节点，默认地图根节点；下钻时会传入省份分组
	 * @param depth 光晕所在的 z 高度（世界坐标），通常取父级的拉伸厚度
	 * @param spatialScale 层级缩放系数，下钻越深值越小，用于同步收缩线宽与偏移
	 * @returns 生成的光晕对象，调用方可继续做透明度动画
	 */
	createBorderGlow(
		feature: MapFeature,
		parent = this.map,
		depth = 0.36,
		spatialScale = 1,
	) {
		// 光晕不需要原始精度：按 0.006 的间距抽稀外环，再抬高 0.008 避开顶面 z-fighting
		const rings = polygonsOf(feature).map((polygon) =>
			this.geometry
				.simplifyRing(polygon[0], 0.006 * spatialScale)
				.map(
					(point) =>
						new Vector3(point.x, point.y, depth + 0.008 * spatialScale),
				),
		);
		// materialBounds 记录的是整块地图的包围盒与高度，供描边 shader 做坐标归一化
		const stroke = this.mapEffects.stroke(
			rings,
			spatialScale,
			parent.userData.materialBounds as Vector3 | undefined,
		);
		parent.add(stroke);
		return stroke;
	}

	/**
	 * 构建周边国家剪影与国名，作为中国地图的环境底衬。
	 * @param countries 世界国界数据，内部会过滤掉中国本身
	 */
	createSurrounding(countries: FeatureCollection<Polygon | MultiPolygon>) {
		const group = this.surrounding;
		group.name = "ChinaSurroundingContext";
		// 投影结果是 xy 平面上的地图，绕 x 轴 -90° 翻成水平面，再整体下沉 0.08 垫在省块下面
		group.rotation.x = -Math.PI / 2;
		group.position.y = this.map.position.y - 0.08;
		// 用中英文正则在数据层排掉中国，避免剪影与本国立体块重叠出现双层描边
		const shapes = countries.features.flatMap((feature) =>
			/China|中国|中华人民共和国/i.test(String(feature.properties?.name ?? ""))
				? []
				: this.geometry.shapes(feature),
		);
		const land = new Mesh(
			new ShapeGeometry(shapes),
			this.geometry.contextMaterial(
				new MeshBasicMaterial({
					color: "#142d40",
					transparent: true,
					opacity: 0.74,
				}),
			),
		);
		land.name = "SurroundingLandSilhouette";
		// 剪影只做视觉底衬，清空 raycast 后鼠标命中省份时不会被它截胡
		land.raycast = () => undefined;
		group.add(land);
		// 9 个邻国的中文名与人工挑选的近似经纬度（尽量落在国土空白处，避免压到边界线）
		const countryNames: [string, [number, number]][] = [
			["哈萨克斯坦", [76, 44.2]],
			["俄罗斯", [111.5, 57.5]],
			["蒙古", [106.5, 46.4]],
			["朝鲜", [130.3, 39.2]],
			["日本", [139.5, 36.7]],
			["印度", [80.0, 29.0]],
			["缅甸", [94.8, 23.6]],
			["老挝", [103.8, 18.6]],
			["越南", [108.6, 14.7]],
		];
		for (const [name, coordinates] of countryNames) {
			const label = this.createLabel(
				name,
				this.geometry.point(coordinates, 0.06),
				false,
				12,
				"context",
			);
			group.add(label);
		}
		// 挂到 background 而不是 map：底衬不参与地图的旋转与升降
		this.background.add(group);
	}

	/**
	 * 创建城市监测点（信息点）：位置取自静态数据，index 用作错峰动画与信息卡编号。
	 */
	createCityMarkers() {
		chinaInfoPoints.forEach((item, index) => {
			const position = this.geometry.point(
				[item.lng, item.lat],
				CHINA_MAP_DEPTH + 0.06,
			);
			// index 同时决定信息点的入场相位与弹窗编号，必须与数据顺序保持一致
			const info = this.mapEffects.info(position, index);
			this.layers.point.add(info.group, info.marker);
			this.monitoringMarkers.push(info.marker);
		});
	}

	/**
	 * 创建业务散点：半径由权重线性映射到 0.09~0.17 世界单位（value 上限按 196 归一）。
	 */
	createScatter() {
		// 权重按 196 归一后映射到 0.09~0.17 的半径区间，保证最弱的点也可见、最强的点不压过省界
		for (const item of chinaScatterPoints)
			this.layers.scatter.add(
				this.mapEffects.scatter(
					this.geometry.point([item.lng, item.lat], CHINA_MAP_DEPTH + 0.08),
					0.09 + (item.value / 196) * 0.08,
				),
			);
	}

	/**
	 * 创建从全国几何中心辐射到 6 个重点省份的飞线，并叠加中心聚焦圈。
	 */
	createFlylines() {
		// [104.3, 35.7] 既是视觉上的国土中心，也是 Mercator 投影的 center，投影后恰好落在原点附近
		const center = this.geometry.point([104.3, 35.7], CHINA_MAP_DEPTH + 0.06);
		this.layers.flyline.add(this.mapEffects.focus(center));
		const names = [
			"广东省",
			"上海市",
			"四川省",
			"北京市",
			"新疆维吾尔自治区",
			"黑龙江省",
		];
		chinaRegions
			.filter((item) => names.includes(item.name))
			.forEach((item, index) => {
				const end = this.geometry.point(item.centroid, CHINA_MAP_DEPTH + 0.06);
				// 起终点过近时弧线会退化成一条折线，直接跳过
				if (center.distanceTo(end) < 0.2) return;
				const middle = center.clone().lerp(end, 0.5);
				// 中点抬高「距离的 22%、最少 0.6」，保证短程航线也有明显的拱形高度
				middle.z += Math.max(center.distanceTo(end) * 0.22, 0.6);
				const curve = new QuadraticBezierCurve3(center, middle, end);
				this.layers.flyline.add(this.mapEffects.flyline(curve, 1, index));
			});
	}

	/**
	 * 创建热力覆盖层与告警点：热力簇写成 [经度, 纬度, 半径倍率, 强度]，
	 * 半径倍率相对于覆盖层内部的基础半径，强度用于混色与闪烁幅度。
	 */
	createHeat() {
		const clusters: [number, number, number, number][] = [
			[87.5, 42.3, 1.6, 0.58],
			[88.6, 35.7, 1.7, 0.73],
			[103.2, 34, 2.0, 0.95],
			[106.0, 33.4, 2.2, 0.78],
			[108.6, 32.5, 1.9, 1],
			[113.2, 28, 1.9, 0.92],
			[118, 30, 2.3, 0.82],
			[120.0, 40.5, 2.0, 0.95],
			[125.0, 44.5, 1.9, 0.72],
		];
		this.layers.heat.add(
			this.overlays.createHeatSurface(
				clusters.map(([lon, lat, size, intensity]) => ({
					position: this.geometry.point([lon, lat], CHINA_MAP_DEPTH + 0.015),
					size,
					intensity,
				})),
			),
		);
		// 4 个固定的告警点分别位于东北、滇南、冀北与陕北，挑在省界交错的视觉焦点处
		this.overlays.createAlertPoints(this.layers.point, [
			this.geometry.point([127.5, 45.7], CHINA_MAP_DEPTH + 0.06),
			this.geometry.point([100.4, 25.3], CHINA_MAP_DEPTH + 0.06),
			this.geometry.point([114.4, 41.1], CHINA_MAP_DEPTH + 0.06),
			this.geometry.point([108.9, 36.4], CHINA_MAP_DEPTH + 0.06),
		]);
	}
}

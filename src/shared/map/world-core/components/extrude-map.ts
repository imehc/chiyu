/**
 * 立体地图：在平面轮廓的基础上用 ExtrudeGeometry 沿 +Z 挤出厚度，
 * 顶面与侧面各用一份材质，做出省份「有厚度」的立体块。
 * 与 base-map 共用同一套墨卡托投影参数，通常叠在平面底色之上使用。
 */
import { geoMercator } from "d3-geo";
import type { FeatureCollection, MultiPolygon } from "geojson";
import {
	ExtrudeGeometry,
	Group,
	type Material,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Shape,
	Vector2,
	Vector3,
} from "three";
import type Assets from "../../assets";
import type Time from "../../utils/time";
import { transfromMapGeoJSON } from "../../utils/transfrom-map-geojson";
import type { Coordinate } from "./base-map";

/**
 * 运行时依赖。
 * assets 预留给贴图加载，time 预留给后续动态效果，当前实现均未直接使用。
 */
interface ExtrudeMapConfig {
	assets: Assets;
	time: Time;
}

/** 构造选项：投影中心与顶面/侧面材质必填，其余字段从 defaultOption 继承 */
type ExtrudeMapOption = Omit<
	typeof defaultOption,
	"geoProjectionCenter" | "topFaceMaterial" | "sideMaterial"
> & {
	geoProjectionCenter: Vector2 | number[];
	topFaceMaterial: Material;
	sideMaterial: Material;
};

/**
 * 默认选项。
 * 顶面 0x18263b、侧面 0x07152b，侧面更深以强化厚度感；
 * depth 0.1 是相对地图尺寸的挤出高度，量级与 120 的投影缩放匹配。
 */
const defaultOption = {
	position: new Vector3(0, 0, 0),
	geoProjectionCenter: new Vector2(0, 0),
	geoProjectionScale: 120,
	data: "",
	renderOrder: 1,
	topFaceMaterial: new MeshBasicMaterial({
		color: 0x18263b,
		transparent: true,
		opacity: 1,
	}),
	sideMaterial: new MeshBasicMaterial({
		color: 0x07152b,
		transparent: true,
		opacity: 1,
	}),
	depth: 0.1,
};

/**
 * 立体地图构建器。
 * 每个行政区对应一个 Object3D，组内按多边形环分别生成带厚度的 Mesh；
 * 挤出方向为 +Z，所以地图天然立在 XY 平面上，不需要额外旋转。
 */
export default class ExtrudeMap {
	/** 资源管理器，预留给贴图/材质扩展 */
	#assets: Assets;
	/** 帧循环，预留给动态效果 */
	#time: Time;
	#option: ExtrudeMapOption;
	/** 地图根节点 */
	#mapGroup: Group;
	/** 行政区属性缓存，顺序与 GeoJSON features 一致 */
	#coordinates: Coordinate[];

	/**
	 * @param config 场景级依赖（assets / time）
	 * @param option 选项，未传字段用 defaultOption 补齐
	 */
	constructor(config: ExtrudeMapConfig, option: Partial<ExtrudeMapOption>) {
		this.#mapGroup = new Group();
		this.#assets = config.assets;
		this.#time = config.time;
		this.#coordinates = [];
		this.#option = Object.assign({}, defaultOption, option);
		this.#mapGroup.position.copy(this.#option.position);

		const mapData = transfromMapGeoJSON(this.#option.data);
		this.create(mapData);
	}

	/** 行政区属性列表，供标签与交互按名称取经纬度 */
	get coordinates() {
		return this.#coordinates;
	}

	/**
	 * 经纬度 → 地图平面坐标。
	 * 与 BaseMap 保持完全一致的投影参数，两层才能严丝合缝地叠在一起。
	 * @param args [经度, 纬度]，东经/北纬为正
	 * @returns [x, y]，单位为世界坐标；使用方取 (x, -y) 翻成 Y 向上
	 */
	geoProjection(args: [number, number]) {
		let center: number[] = [];
		if (this.#option.geoProjectionCenter instanceof Vector2) {
			const x = this.#option.geoProjectionCenter.x;
			const y = this.#option.geoProjectionCenter.y;
			center = [x, y];
		} else {
			center = this.#option.geoProjectionCenter;
		}
		return geoMercator()
			.center(center as [number, number])
			.scale(this.#option.geoProjectionScale)
			.translate([0, 0])(args) as [number, number];
	}

	/**
	 * 按 feature 逐个生成挤出几何。
	 * 材质数组的顺序对应 ExtrudeGeometry 的材质分组：索引 0 为顶/底面、
	 * 索引 1 为侧面，因此传入 [topFaceMaterial, sideMaterial] 即可分别上色。
	 * @param mapData 已由 transfromMapGeoJSON 归一化的数据
	 */
	create(mapData: FeatureCollection) {
		mapData.features.forEach((feature) => {
			const group = new Object3D();
			const {
				name,
				center = [],
				centroid = [],
			} = feature.properties as Coordinate;
			this.coordinates.push({ name, center, centroid });
			// bevelEnabled 保留 1 段倒角，让轮廓转折处有细窄的斜面高光，
			// bevelThickness 与 depth 同量级，避免倒角把侧面吃掉。
			const extrudeSettings = {
				depth: this.#option.depth,
				bevelEnabled: true,
				bevelSegments: 1,
				bevelThickness: 0.1,
			};
			const materials = [
				this.#option.topFaceMaterial,
				this.#option.sideMaterial,
			];
			(feature.geometry as MultiPolygon).coordinates.forEach((multiPolygon) => {
				multiPolygon.forEach((polygon) => {
					// 一个 Shape 对应一个多边形环，ExtrudeGeometry 会沿 Z 轴扫出厚度
					const shape = new Shape();
					for (let i = 0; i < polygon.length; i++) {
						if (!polygon[i][0] || !polygon[i][1]) {
							return;
						}
						// 与平面地图一致：投影后取 -y，把屏幕坐标翻成 Y 向上
						const [x, y] = this.geoProjection(polygon[i] as [number, number]);
						if (i === 0) {
							shape.moveTo(x, -y);
						}
						shape.lineTo(x, -y);
					}

					const geometry = new ExtrudeGeometry(shape, extrudeSettings);
					// 材质数组顺序必须与 geometry 的分组索引一致，否则侧面会被贴成顶面色
					const mesh = new Mesh(geometry, materials);

					group.add(mesh);
				});
			});
			this.#mapGroup.add(group);
		});
	}

	/** 把地图根节点挂到指定父节点 */
	setParent(parent: Object3D) {
		parent.add(this.#mapGroup);
	}
}

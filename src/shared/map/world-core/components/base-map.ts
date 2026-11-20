/**
 * 平面地图：用 d3-geo 的墨卡托投影把 GeoJSON 边界转成 Three.js Shape，
 * 再三角化成 ShapeGeometry 摊在 XY 平面（Z≈0），作为省级地图的底色层或高亮层。
 * 与 extrude-map 共用投影参数，通常按不同 Z 高度叠放形成「底面 + 顶面」。
 */
import { geoMercator } from "d3-geo";
import type { FeatureCollection, MultiPolygon, Position } from "geojson";
import {
	Group,
	type Material,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Shape,
	ShapeGeometry,
	Vector2,
	Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { transfromMapGeoJSON } from "../../utils/transfrom-map-geojson";

/** 配置占位类型：平面地图不需要额外运行时依赖 */
type BaseMapConfig = undefined;

/** 构造选项：投影中心与材质必填，其余字段从 defaultOption 继承 */
type BaseMapOption = Omit<
	typeof defaultOption,
	"geoProjectionCenter" | "material"
> & {
	geoProjectionCenter: Vector2 | number[];
	material: Material;
};

/**
 * 默认选项。
 * 填充色 0x18263b 为深蓝，配合 transparent 便于后续用 opacity 做整层淡入淡出；
 * renderOrder 1 保证地图压在网格线（-1）之上、又在描边线之下。
 */
const defaultOption = {
	position: new Vector3(0, 0, 0),
	geoProjectionCenter: new Vector2(0, 0),
	geoProjectionScale: 120,
	data: "",
	renderOrder: 1,
	merge: false,
	material: new MeshBasicMaterial({
		color: 0x18263b,
		transparent: true,
		opacity: 1,
	}),
};

/**
 * 行政区属性，对应 GeoJSON features[].properties 中的字段。
 */
export type Coordinate = {
	/** 行政区名称，同时写进 mesh.userData 供射线拾取时反查 */
	name: string;
	/** 几何中心经纬度，由数据生产方计算 */
	center: Position;
	/** 质心经纬度，比 center 更贴近视觉重心，适合放标签与柱体 */
	centroid: Position;
};

/**
 * 平面地图构建器。
 * 所有几何都落在 XY 平面，Z 由使用方通过 position 抬高，
 * 因此同一份 GeoJSON 可以叠出多层效果而不必重复生成路径。
 */
export default class BaseMap {
	/** 地图根节点，通过 setParent 挂到场景或其它 Object3D */
	#mapGroup: Group;
	/** 各行政区属性，顺序与 GeoJSON features 一致 */
	#coordinates: Coordinate[] = [];
	#option: BaseMapOption;
	/**
	 * @param _config 预留参数，当前未使用
	 * @param option 选项，未传字段用 defaultOption 补齐
	 */
	constructor(_config: BaseMapConfig, option: Partial<BaseMapOption>) {
		this.#mapGroup = new Group();
		this.#coordinates = [];
		this.#option = Object.assign({}, defaultOption, option);
		this.#mapGroup.position.copy(this.#option.position);
		const mapData = transfromMapGeoJSON(this.#option.data);
		this.create(mapData);
	}

	/** 地图根节点 */
	get mapGroup() {
		return this.#mapGroup;
	}

	/** 行政区属性列表，标签层与交互逻辑按名称从这里查经纬度 */
	get coordinates() {
		return this.#coordinates;
	}

	/**
	 * 经纬度 → 地图平面坐标。
	 * 使用墨卡托投影：center 为投影中心经纬度，scale 为缩放系数（每弧度对应的世界单位），
	 * translate 固定为 (0,0)，让投影中心恰好落在世界原点。
	 * @param args [经度, 纬度]，东经/北纬为正
	 * @returns [x, y]，单位为世界坐标；调用方通常取 (x, -y) 把屏幕 Y 轴翻成世界 Y 轴向上
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
	 * 根据 GeoJSON 生成地图几何。
	 * merge 为 false 时每个 feature 一个 Object3D、每个多边形环一个 Mesh；
	 * merge 为 true 时把所有环的几何合成一个 Mesh，draw call 从「环数」降到 1。
	 * @param mapData 已由 transfromMapGeoJSON 归一化的数据（Polygon 已包成 MultiPolygon）
	 */
	create(mapData: FeatureCollection) {
		const { merge } = this.#option;
		const shapes: ShapeGeometry[] = [];
		mapData.features.forEach((feature) => {
			const group = new Object3D();
			const {
				name,
				center = [],
				centroid = [],
			} = feature.properties as Coordinate;
			// 先登记属性，保证坐标顺序与 features 一致，便于按索引反查
			this.coordinates.push({ name, center, centroid });
			group.userData.name = name as string;
			(feature.geometry as MultiPolygon).coordinates.forEach((multiPolygon) => {
				multiPolygon.forEach((polygon) => {
					// 一个 Shape 对应一个多边形环（外环或内环），ShapeGeometry 负责三角剖分
					const shape = new Shape();
					for (let i = 0; i < polygon.length; i++) {
						if (!polygon[i][0] || !polygon[i][1]) {
							return;
						}
						// 投影结果沿用屏幕坐标（Y 向下），取 -y 翻成世界坐标的 Y 向上
						const [x, y] = this.geoProjection(polygon[i] as [number, number]);
						if (i === 0) {
							shape.moveTo(x, -y);
						}
						shape.lineTo(x, -y);
					}
					const geometry = new ShapeGeometry(shape);
					if (merge) {
						// 合并模式先收集几何，最后一次性 merge，把 draw call 压到 1
						shapes.push(geometry);
					} else {
						const mesh = new Mesh(geometry, this.#option.material);
						mesh.renderOrder = this.#option.renderOrder;
						mesh.userData.name = name;
						group.add(mesh);
					}
				});
			});
			if (!merge) {
				this.#mapGroup.add(group);
			}
		});
		if (merge) {
			const geometry = mergeGeometries(shapes);
			const mesh = new Mesh(geometry, this.#option.material);
			mesh.renderOrder = this.#option.renderOrder;
			this.#mapGroup.add(mesh);
		}
	}

	/** 把地图根节点挂到指定父节点（场景或某个 Group） */
	setParent(parent: Object3D) {
		parent.add(this.#mapGroup);
	}
}

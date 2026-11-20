/**
 * 行政区边界线：把 GeoJSON 轮廓投影后生成三种线型之一——
 * LineLoop（最细的普通折线）、Line2（以像素为单位的粗线）、
 * Line3（CatmullRom 曲线 + TubeGeometry 的管状线）。
 * 用于给平面地图描边，或为立体地图勾出高亮轮廓。
 */
import { geoMercator } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import {
	BufferGeometry,
	CatmullRomCurve3,
	Group,
	LineBasicMaterial,
	LineLoop,
	Mesh,
	type MeshBasicMaterial,
	type Object3D,
	TubeGeometry,
	Vector2,
	Vector3,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { transfromMapGeoJSON } from "../../utils/transfrom-map-geojson";

/** 配置占位类型：边界线不需要额外运行时依赖 */
type LineConfig = undefined;

/** 构造选项：投影中心与材质必填，其余字段从 defaultOption 继承 */
type LineOption = Omit<
	typeof defaultOption,
	"geoProjectionCenter" | "material"
> & {
	geoProjectionCenter: Vector2 | number[];
	material: LineBasicMaterial | MeshBasicMaterial;
};

/**
 * 默认选项。
 * visibelProvince 为需要跳过的行政区名（例如只画全国轮廓时挖掉当前省）；
 * tubeRadius / tubeSegments 仅 Line3 使用，分段数 2560 是为长边界也能保持平滑，
 * 代价是顶点数较大，只在少数高亮轮廓上使用。
 */
const defaultOption = {
	visibelProvince: "",
	geoProjectionCenter: [0, 0],
	geoProjectionScale: 120,
	position: new Vector3(0, 0, 0),
	data: "",
	material: new LineBasicMaterial({ color: 0xffffff }),
	type: "LineLoop",
	renderOrder: 1,
	tubeRadius: 0.2,
	tubeSegments: 256 * 10,
};

/**
 * 边界线构建器。
 * 每个 feature 对应一个 Group（命名 meshLineGroupN），组内每个多边形环生成一条线；
 * 分组便于外部按行政区整体显隐或替换材质。
 */
export default class Line {
	#option: LineOption;
	/** 全部边界线的根节点 */
	#lineGroup: Group;

	/**
	 * @param _config 预留参数，当前未使用
	 * @param option 选项，未传字段用 defaultOption 补齐
	 */
	constructor(_config: LineConfig, option: Partial<LineOption>) {
		this.#option = Object.assign({}, defaultOption, option);
		const mapData = transfromMapGeoJSON(this.#option.data);
		const lineGroup = this.create(mapData);
		this.#lineGroup = lineGroup;

		this.#lineGroup.position.copy(this.#option.position);
	}

	/** 线条根节点，可整体平移高度以避免与地图面共面 */
	get lineGroup() {
		return this.#lineGroup;
	}

	/**
	 * 经纬度 → 地图平面坐标。
	 * 与 BaseMap / ExtrudeMap 使用同一组 center 与 scale，三层才能对齐。
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
	 * 按要素逐个生成边界线。
	 * 三种线型共用同一组投影后的点，差异只在交给哪种几何：
	 * LineLoop 首尾自动闭合，Line2 支持屏幕像素线宽，Line3 走管状几何。
	 * @param mapData 已由 transfromMapGeoJSON 归一化的数据
	 */
	create(mapData: FeatureCollection) {
		const { type, visibelProvince } = this.#option;
		const features = mapData.features;
		const lineGroup = new Group();
		for (let i = 0; i < features.length; i++) {
			const element = features[i] as Feature;
			const group = new Group();
			group.name = `meshLineGroup${i}`;
			// 命中的行政区直接跳过，用于「挖掉」当前聚焦区域，避免轮廓线压住高亮面
			if (element.properties?.name === visibelProvince) {
				continue;
			}
			let line: Line | Mesh | LineLoop | null = null;
			(element.geometry as MultiPolygon).coordinates.forEach((coords) => {
				const points: Vector3[] = [];
				line = null;
				// 三个分支都只取 coords[0]（外环）描边，内环（飞地孔洞）不单独画
				if (type === "Line2") {
					coords[0].forEach((item) => {
						// 注意：-y 把 d3 的屏幕坐标翻成 Three.js 的 Y 向上
						const [x, y] = this.geoProjection(item as [number, number]);
						points.push(new Vector3(x, -y, 0));
					});
					line = this.createLine2(points) as Line2;
				} else if (type === "Line3") {
					coords[0].forEach((item) => {
						const [x, y] = this.geoProjection(item as [number, number]);
						points.push(new Vector3(x, -y, 0));
					});
					line = this.createLine3(points);
				} else {
					coords[0].forEach((item) => {
						const [x, y] = this.geoProjection(item as [number, number]);
						points.push(new Vector3(x, -y, 0));
						// 普通线型在循环内逐步重建几何，最终保留的是包含全部点的最后一条
						line = this.createLine(points);
					});
				}
				group.add(line as Object3D);
			});
			lineGroup.add(group);
		}
		return lineGroup;
	}

	/** 生成闭合折线；BufferGeometry 直接复用点数组，是最省的一档 */
	createLine(points: Vector3[]) {
		const { material, renderOrder } = this.#option;
		const geometry = new BufferGeometry();
		geometry.setFromPoints(points);
		const line = new LineLoop(geometry, material);
		line.renderOrder = renderOrder;
		line.name = "mapLine";
		return line;
	}

	/**
	 * 生成带像素宽度的线。
	 * Line2 必须搭配 LineMaterial，线宽以屏幕像素计，与 WebGL 原生 linewidth 不通用，
	 * 因此这里只继承颜色与线宽，其余参数取默认值。
	 * @returns 材质不是 LineBasicMaterial 时返回 undefined，调用方需自行判空
	 */
	createLine2(points: Vector3[]) {
		const { material, renderOrder } = this.#option;
		if (material instanceof LineBasicMaterial) {
			const geometry = new LineGeometry();
			// LineGeometry 需要扁平数组 [x0,y0,z0, x1,y1,z1, ...]
			const positions = points.flatMap((p) => [p.x, p.y, p.z]);
			geometry.setPositions(positions);
			const lineMaterial = new LineMaterial({
				color: material.color.getHex(),
				linewidth: material.linewidth || 1,
			});
			const line = new Line2(geometry, lineMaterial);
			line.name = "mapLine2";
			line.renderOrder = renderOrder;
			// 生成沿线的累计距离，LineMaterial 的虚线等特性依赖该属性
			line.computeLineDistances();
			return line;
		}
	}

	/**
	 * 生成管状线：把点串成 CatmullRom 曲线，再沿曲线扫出圆管。
	 * 默认半径 0.2、圆周方向仅 4 段（方形截面），近景下也够圆润且省顶点。
	 */
	createLine3(points: Vector3[]) {
		const tubeRadius = this.#option.tubeRadius;
		const tubeSegments = this.#option.tubeSegments;
		// 径向 4 段用方形截面近似圆管，把顶点数压到最低
		const tubeRadialSegments = 4;
		const closed = false;

		const { material, renderOrder } = this.#option;

		// CatmullRom 会穿过所有原始点，并自动在拐角处插值出平滑曲线
		const curve = new CatmullRomCurve3(points);
		const tubeGeometry = new TubeGeometry(
			curve,
			tubeSegments,
			tubeRadius,
			tubeRadialSegments,
			closed,
		);
		const line = new Mesh(tubeGeometry, material);
		line.name = "mapLine3";
		line.renderOrder = renderOrder;
		return line;
	}

	/** 把全部边界线挂到指定父节点 */
	setParent(parent: Object3D) {
		parent.add(this.lineGroup);
	}
}

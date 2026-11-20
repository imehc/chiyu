/**
 * 地面网格：由三部分叠加而成——GridHelper 线框、每个交点处的十字标记、
 * 覆盖全场的点阵粒子，用来表现大屏底部的「科技感网格」。
 * 与其它组件不同，它在构造时直接把自己加入场景，无需再调用 setParent。
 */
import {
	BufferAttribute,
	BufferGeometry,
	DoubleSide,
	GridHelper,
	Group,
	Mesh,
	MeshBasicMaterial,
	NormalBlending,
	Points,
	PointsMaterial,
	type Scene,
	Shape,
	ShapeGeometry,
	Vector2,
	Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type Time from "../../utils/time";

/**
 * 运行时依赖。
 */
interface GridConfig {
	/** 网格直接挂载到该场景 */
	scene: Scene;
	/** 帧循环，预留给点阵动画 */
	time: Time;
}

/** 选项类型即默认选项的结构 */
type GridOption = typeof defaultOption;

/**
 * 默认选项。
 * 尺寸 100、20 等分即单格 5 个世界单位；颜色取偏青的灰，压低存在感，
 * 让地图成为视觉主体。pointLayout 是点阵的行列数，200×200 共 4 万个点。
 */
const defaultOption = {
	position: new Vector3(0, 0, 0),
	gridSize: 100,
	gridDivision: 20,
	gridColor: 0x28373a,
	shapeSize: 1,
	shapeColor: 0x8e9b9e,
	pointSize: 0.2,
	pointColor: 0x28373a,
	pointLayout: {
		row: 200,
		col: 200,
	},
	pointBlending: NormalBlending,
};

/**
 * 网格背景构建器。
 * 只在构造时生成一次静态几何并挂到场景，之后没有逐帧更新。
 */
export default class Grid {
	#scene: Scene;
	#time: Time;
	#option: GridOption;

	/** 网格根节点，构造完成后一定存在，故使用明确赋值断言 */
	#instance!: Group;

	/**
	 * @param config 场景与帧循环
	 * @param option 尺寸、颜色等覆盖值
	 */
	constructor(config: GridConfig, option?: Partial<GridOption>) {
		this.#scene = config.scene;
		this.#time = config.time;
		this.#option = Object.assign({}, defaultOption, option);
		this.init();
	}

	/** 取网格根节点，可用于整体显隐或替换位置 */
	get instance() {
		return this.#instance;
	}

	/** 组装线框、十字标记与点阵三部分，整体按 option.position 平移后加入场景 */
	init() {
		const group = new Group();
		group.name = "Grid";
		const grid = this.createGridHelp();
		const shapes = this.createShapes();
		const points = this.createPoint();
		group.add(grid, shapes, points);
		group.position.copy(this.#option.position);
		this.#instance = group;
		this.#scene.add(group);
	}

	/**
	 * 在每个网格交点放置十字标记。
	 * 先由 gridSize / gridDivision 算出格距，遍历 (division+1)² 个交点，
	 * 每个十字单独生成几何后统一 merge，最终只剩一个 draw call。
	 * @returns 已旋转到 XZ 平面并抬高 0.01 的单个 Mesh
	 */
	createShapes() {
		const { gridSize, gridDivision, shapeSize, shapeColor } = this.#option;
		const shapeSpace = gridSize / gridDivision;
		// range 是半边长，平移时以原点为中心向两侧铺开
		const range = gridSize / 2;
		const shapeMaterial = new MeshBasicMaterial({
			color: shapeColor,
			side: DoubleSide,
		});
		const shapeGeometrys = [];
		for (let i = 0; i < gridDivision + 1; i++) {
			for (let j = 0; j < gridDivision + 1; j++) {
				const shapeGeometry = this.createPlus(shapeSize);
				shapeGeometry.translate(
					-range + i * shapeSpace,
					-range + j * shapeSpace,
					0,
				);
				shapeGeometrys.push(shapeGeometry);
			}
		}
		const geometry = mergeGeometries(shapeGeometrys);
		const shapeMesh = new Mesh(geometry, shapeMaterial);
		// renderOrder 只决定绘制顺序、不改变深度关系；-1 让十字标记最先画，
		// 作为整个场景最底层的装饰
		shapeMesh.renderOrder = -1;
		// XY 平面上的十字绕 X 轴转 -90° 摊平到 XZ 平面，
		// 再抬高 0.01 避免与网格线共面产生 z-fighting 闪烁
		shapeMesh.rotateX(-Math.PI / 2);
		shapeMesh.position.y += 0.01;
		return shapeMesh;
	}

	/**
	 * 生成基础线框网格：每个轴向 division 等分（即 division+1 条线），
	 * 位于 XZ 平面、Y=0；横竖线同色，只保留细线带来的「坐标纸」质感。
	 */
	createGridHelp() {
		const { gridSize, gridDivision, gridColor } = this.#option;
		const gridHelp = new GridHelper(
			gridSize,
			gridDivision,
			gridColor,
			gridColor,
		);
		return gridHelp;
	}

	/**
	 * 生成覆盖全场的点阵。
	 * 顶点按行优先排列，索引 = (i * cols + j) * 3，i 沿 X 轴、j 沿 Z 轴，
	 * 均匀铺满 [-gridSize/2, gridSize/2]；Y 恒为 0，与网格平面共面。
	 * @returns 带 position 属性的 Points 对象，材质使用 sizeAttenuation 让近大远小
	 */
	createPoint() {
		const { gridSize, pointSize, pointColor, pointBlending, pointLayout } =
			this.#option;
		const rows = pointLayout.row;
		const cols = pointLayout.col;
		// 每个顶点 3 个分量（x/y/z），整块一次性分配，避免循环里反复扩容
		const positions = new Float32Array(rows * cols * 3);
		for (let i = 0; i < rows; i++) {
			for (let j = 0; j < cols; j++) {
				// rows - 1 / cols - 1 做分母，首尾点正好落在场地的两条边界上
				const x = (i / (rows - 1)) * gridSize - gridSize / 2;
				const y = 0;
				const z = (j / (cols - 1)) * gridSize - gridSize / 2;
				// 索引是顶点序号，写入时要乘 3 换算成分量偏移
				const index = (i * cols + j) * 3;
				positions[index] = x;
				positions[index + 1] = y;
				positions[index + 2] = z;
			}
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute("position", new BufferAttribute(positions, 3));
		const material = new PointsMaterial({
			size: pointSize,
			sizeAttenuation: true,
			color: pointColor,
			blending: pointBlending,
		});
		const particles = new Points(geometry, material);

		return particles;
	}

	/** 预留：切换点阵的显示模式，当前未实现，调用无副作用 */
	setPointMode() {}

	/**
	 * 构造单个十字轮廓（两个互相垂直的细长矩形拼成）。
	 * @param shapeSize 十字的尺寸基准，默认 50；臂宽 w = size/18，臂半长 h = size/3
	 * @returns 位于 XY 平面、以原点为中心的 ShapeGeometry，曲线分段数 24
	 */
	createPlus(shapeSize = 50) {
		const w = shapeSize / 6 / 3;
		const h = shapeSize / 3;
		// 顶点按顺序给出 13 个点，Shape 自动闭合首尾，共 13 条边
		const points = [
			new Vector2(-h, -w),
			new Vector2(-w, -w),
			new Vector2(-w, -h),
			new Vector2(w, -h),
			new Vector2(w, -h),
			new Vector2(w, -w),
			new Vector2(h, -w),
			new Vector2(h, w),
			new Vector2(w, w),
			new Vector2(w, h),
			new Vector2(-w, h),
			new Vector2(-w, w),
			new Vector2(-h, w),
		];
		const shape = new Shape(points);
		const shapeGeometry = new ShapeGeometry(shape, 24);
		return shapeGeometry;
	}
}

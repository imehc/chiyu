/**
 * 全球货运航线：在蓝色主题的地球表面生成铁路、海运、空运三类航线，
 * 包含航线数据、弧线几何、流动光点、端点标记与移动载具。
 * 由地球场景装配层创建，主循环逐帧调用 update()；setMode() 控制分类开关，
 * dispose() 统一释放 GPU 资源。内部结构依次为：
 * 数据（waypoints / 目的地表）→ 几何（SurfaceRouteCurve / AirRouteCurve）
 * → 材质（贴地 Tube + 流动尾迹 shader）→ 动画（update 推进 progress）。
 */
import {
	AdditiveBlending,
	BufferGeometry,
	CanvasTexture,
	CatmullRomCurve3,
	Color,
	Curve,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineSegments,
	type Material,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	ShaderMaterial,
	SphereGeometry,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	type Texture,
	TorusGeometry,
	TubeGeometry,
	Vector3,
} from "three";

/** 货运方式：铁路 / 海运 / 空运，决定配色、几何粗细与推进速度。 */
export type FreightMode = "rail" | "sea" | "air";

/** 经纬度，顺序固定为 [经度, 纬度]，单位为度，东经与北纬为正。 */
type Coordinates = readonly [longitude: number, latitude: number];

/**
 * 单条航线的运行时描述。
 * 几何与材质在 addRoute 中创建，这里只保留动画所需的引用与状态。
 */
interface Route {
	/** 唯一标识，用于 getState() 上报与调试定位 */
	id: string;
	/** 中文展示名，形如「上海—中亚—杜伊斯堡」 */
	name: string;
	/** 所属方式，同时决定挂在哪个分组下 */
	mode: FreightMode;
	/** 参数曲线；getPointAt(t) 按弧长均分返回世界坐标，t ∈ [0, 1] */
	curve: Curve<Vector3>;
	/** 原始经纬度控制点，供端点标记与外部展示使用 */
	waypoints: readonly Coordinates[];
	/** 进度推进速度，单位为「圈/秒」，即每秒走过的曲线比例 */
	speed: number;
	/** 初始相位偏移 ∈ [0, 1)，错开各航线起点，避免同时出发 */
	offset: number;
	/** 当前进度 ∈ [0, 1)，每帧由 update 重写 */
	progress: number;
	/** 弧线最大抬升高度（世界坐标单位）；铁路/海运为 0 表示完全贴地 */
	height: number;
	/** 流动光带的 shader 材质，update 中只改它的 head uniform */
	tail: ShaderMaterial;
	/** 移动载具（Sprite 图标组），短途航线可省略 */
	vehicle?: Group;
}

/**
 * 三种方式的主题色：铁路黄、海运绿、空运浅蓝，与蓝色大屏整体色调协调。
 * 同一颜色同时用于底线、端点、流动光带与 canvas 图标，保证视觉一致。
 */
const COLORS: Record<FreightMode, string> = {
	rail: "#f6dc43",
	sea: "#29e797",
	air: "#a7d7f3",
};
/** 地球网格半径；航线统一贴这个半径绘制，略大于球体本身以避免深度冲突 */
const SURFACE_RADIUS = 5.18;
/** 载具局部基把 +Y 当作前进方向；UP 即该方向在世界系下的来源向量 */
const UP = new Vector3(0, 1, 0);
/** 空运航线的统一起点：北京 */
const BEIJING: Coordinates = [116.4, 39.9];

// 途经站点把铁路约束在欧亚大陆桥的陆地上；若只做首尾两点的大圆插值，
// 曲线会切到高纬度海面或穿越里海，视觉上不再像一条铁路线。
const RAIL_WAYPOINTS: readonly Coordinates[] = [
	[121.47, 31.23],
	[117.23, 31.82],
	[113.62, 34.75],
	[108.94, 34.34],
	[103.83, 36.06],
	[98.29, 39.78],
	[93.51, 42.83],
	[87.62, 43.82],
	[82.57, 45.17],
	[80.22, 46.95],
	[75.33, 48.32],
	[73.1, 49.8],
	[71.43, 51.13],
	[69.14, 54.88],
	[60.6, 56.83],
	[49.11, 55.79],
	[37.62, 55.75],
	[27.56, 53.9],
	[23.69, 52.1],
	[21.01, 52.23],
	[13.41, 52.52],
	[6.76, 51.43],
];

// 近岸航段、狭窄海峡与运河都显式列点：直接用上海—鹿特丹的大圆航线
// 会横穿亚洲内陆，必须让曲线沿海岸绕过马六甲与苏伊士。
const SEA_WAYPOINTS: readonly Coordinates[] = [
	[122.05, 31.1],
	[122.6, 28],
	[122.5, 25.5],
	[121.7, 23],
	[120.2, 21],
	[116.5, 17],
	[110.7, 11],
	[106, 4.5],
	[104.9, 1.55],
	[104.2, 1.05],
	[103.4, 1.3],
	[101.7, 2],
	[100.5, 3.15],
	[99.5, 4.3],
	[98.3, 6],
	[96.4, 6.4],
	[94.5, 6.3],
	[89, 5.5],
	[82, 5.2],
	[80, 5],
	[70, 8],
	[60, 11.4],
	[54, 13],
	[49, 12.5],
	[45.4, 12],
	[43.4, 12.6],
	[42.3, 15],
	[39.8, 20],
	[36, 25.5],
	[33.9, 27.4],
	[32.6, 29.5],
	[32.52, 29.92],
	[32.43, 30.3],
	[32.32, 30.56],
	[32.35, 30.82],
	[32.3, 31.1],
	[32.35, 31.35],
	[29, 32.6],
	[22, 33.5],
	[15.5, 35],
	[11, 37.6],
	[5, 38.2],
	[0, 37.3],
	[-2.5, 36.2],
	[-4.8, 36],
	[-5.58, 35.95],
	[-6.1, 36],
	[-8.2, 36.1],
	[-9.9, 36.8],
	[-10, 40],
	[-10, 44],
	[-7, 48],
	[-5, 49.4],
	[-2, 50.3],
	[0.7, 50.8],
	[1.5, 51.1],
	[2.6, 51.7],
	[3.7, 52],
	[4.05, 51.95],
];

/**
 * 北京出发的空运目的地表。
 * height 为弧顶抬升量（世界坐标单位，0.65~2.65），距离越远抬得越高，
 * 避免多条弧线在球面上互相遮挡；offset 为初始相位 ∈ [0, 1)，
 * vehicle 表示是否为该航线生成移动图标（只给少量航线，避免图标拥挤）。
 */
const AIR_DESTINATIONS: {
	id: string;
	name: string;
	coordinates: Coordinates;
	height: number;
	offset: number;
	vehicle: boolean;
}[] = [
	{
		id: "tokyo",
		name: "东京",
		coordinates: [139.76, 35.68],
		height: 0.9,
		offset: 0.28,
		vehicle: false,
	},
	{
		id: "seoul",
		name: "首尔",
		coordinates: [126.98, 37.57],
		height: 0.65,
		offset: 0.72,
		vehicle: false,
	},
	{
		id: "moscow",
		name: "莫斯科",
		coordinates: [37.62, 55.75],
		height: 2.05,
		offset: 0.46,
		vehicle: false,
	},
	{
		id: "paris",
		name: "巴黎",
		coordinates: [2.35, 48.86],
		height: 2.65,
		offset: 0.61,
		vehicle: false,
	},
	{
		id: "dubai",
		name: "迪拜",
		coordinates: [55.27, 25.2],
		height: 1.85,
		offset: 0.35,
		vehicle: false,
	},
	{
		id: "singapore",
		name: "新加坡",
		coordinates: [103.82, 1.35],
		height: 1.3,
		offset: 0.77,
		vehicle: true,
	},
	{
		id: "sydney",
		name: "悉尼",
		coordinates: [151.21, -33.87],
		height: 2.55,
		offset: 0.2,
		vehicle: false,
	},
	{
		id: "cairo",
		name: "开罗",
		coordinates: [31.24, 30.04],
		height: 2.3,
		offset: 0.84,
		vehicle: false,
	},
	{
		id: "mumbai",
		name: "孟买",
		coordinates: [72.8, 19.1],
		height: 1.2,
		offset: 0.17,
		vehicle: false,
	},
	{
		id: "new-delhi",
		name: "新德里",
		coordinates: [77.2, 28.6],
		height: 1.5,
		offset: 0.53,
		vehicle: false,
	},
	{
		id: "bangkok",
		name: "曼谷",
		coordinates: [100.5, 13.7],
		height: 1.1,
		offset: 0.63,
		vehicle: false,
	},
	{
		id: "naypyidaw",
		name: "内比都",
		coordinates: [96.1, 19.7],
		height: 1.35,
		offset: 0.41,
		vehicle: false,
	},
	{
		id: "manila",
		name: "马尼拉",
		coordinates: [121, 14.6],
		height: 1.15,
		offset: 0.89,
		vehicle: false,
	},
	{
		id: "perth",
		name: "珀斯",
		coordinates: [115.9, -31.9],
		height: 2.0,
		offset: 0.31,
		vehicle: false,
	},
	{
		id: "canberra",
		name: "堪培拉",
		coordinates: [149.1, -35.3],
		height: 2.45,
		offset: 0.57,
		vehicle: false,
	},
	{
		id: "jakarta",
		name: "雅加达",
		coordinates: [106.8, -6.2],
		height: 1.55,
		offset: 0.73,
		vehicle: false,
	},
];

/**
 * 经纬度转球面直角坐标，符合 three.js 的 Y 轴朝上约定。
 * 经度向东为正且绕 Y 轴递增，因此 z 分量取负号；
 * 该坐标系与地球 Group 的初始朝向一致，整体旋转由父级负责。
 * @param coordinates 经纬度，单位为度
 * @param radius 球半径，默认单位球；只求方向时可省去缩放
 * @returns 以地心为原点的世界坐标
 */
const spherical = (coordinates: Coordinates, radius = 1) => {
	const longitude = (coordinates[0] * Math.PI) / 180;
	const latitude = (coordinates[1] * Math.PI) / 180;
	return new Vector3(
		radius * Math.cos(longitude) * Math.cos(latitude),
		radius * Math.sin(latitude),
		-radius * Math.sin(longitude) * Math.cos(latitude),
	);
};

/**
 * 单位向量之间的球面线性插值（slerp），结果始终落在单位球面上。
 * 用 sin 加权而非直接 lerp，是为了让采样点沿大圆等角速度前进；
 * 否则长距离段的中点会向弦线塌陷，贴地航线会钻进球体内部。
 * @param t 插值系数 ∈ [0, 1]，0 对应 start 方向，1 对应 end 方向
 * @param result 复用的输出向量，避免上千次采样产生大量临时对象
 */
const interpolateSphere = (
	start: Vector3,
	end: Vector3,
	t: number,
	result = new Vector3(),
) => {
	const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
	// 两点几乎重合时 sin(angle) 趋近 0，加权公式会退化为零向量，改用普通插值兜底
	if (angle < 0.00001) return result.copy(start).lerp(end, t).normalize();
	return result
		.copy(start)
		.multiplyScalar(Math.sin((1 - t) * angle))
		.addScaledVector(end, Math.sin(t * angle))
		.normalize();
};

/** 先对沿海/沿站控制点做密集球面插值，再把每个采样点锁到地表半径上。 */
class SurfaceRouteCurve extends Curve<Vector3> {
	/** 平滑后的球面路径，半径仍为 1，取点时才放大到 SURFACE_RADIUS */
	private readonly path: CatmullRomCurve3;

	constructor(waypoints: readonly Coordinates[]) {
		super();
		// 弧长表细分要足够密，getPointAt(t) 才能按等距推进；
		// 否则站点密集区段载具会变慢、长段反而变快。
		this.arcLengthDivisions = 800;
		const samples: Vector3[] = [];
		// 逐段球面插值：steps 由球心夹角决定，0.012 rad 约 76km，
		// 保证跨洲长段也是圆弧而不是直线弦。
		for (let index = 0; index < waypoints.length - 1; index++) {
			const start = spherical(waypoints[index]);
			const end = spherical(waypoints[index + 1]);
			const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
			const steps = Math.max(2, Math.ceil(angle / 0.012));
			for (let step = 0; step < steps; step++)
				samples.push(interpolateSphere(start, end, step / steps));
		}
		samples.push(spherical(waypoints[waypoints.length - 1]));
		// centripetal 参数化可抑制采样点疏密不均造成的尖角与自交
		this.path = new CatmullRomCurve3(samples, false, "centripetal");
	}

	/** 采样后再归一到 SURFACE_RADIUS，确保整条线严格贴合球面 */
	getPoint(t: number, target = new Vector3()) {
		return this.path
			.getPoint(t, target)
			.normalize()
			.multiplyScalar(SURFACE_RADIUS);
	}
}

/** 真球面弧：沿大圆插值并按 sin(πt) 抬升，远距离也不会穿入地表。 */
class AirRouteCurve extends Curve<Vector3> {
	/** 起点方向的单位向量 */
	private readonly start: Vector3;
	/** 终点方向的单位向量 */
	private readonly end: Vector3;

	constructor(
		start: Coordinates,
		end: Coordinates,
		private height: number,
	) {
		super();
		// 240 段对空运弧已足够平滑，约为贴地航线 800 段的三分之一
		this.arcLengthDivisions = 240;
		this.start = spherical(start);
		this.end = spherical(end);
	}

	getPoint(t: number, target = new Vector3()) {
		// sin(πt) 在 t=0/1 处为 0、t=0.5 处为 1：两端贴地、弧顶最高，
		// 即半径 = 地表半径 + 该时刻的抬升量，最大抬升为 height。
		return interpolateSphere(this.start, this.end, t, target).multiplyScalar(
			SURFACE_RADIUS + Math.sin(t * Math.PI) * this.height,
		);
	}
}

/** 地球局部坐标系下的货运航线集合：黄色铁路、绿色海运、蓝色空运。 */
export default class GlobeFreight {
	readonly group = new Group();
	/** 按方式分组；setMode 只切换分组 visible，即可一次性隐藏同类航线 */
	private readonly modes: Record<FreightMode, Group> = {
		rail: new Group(),
		sea: new Group(),
		air: new Group(),
	};
	private readonly routes: Route[] = [];
	/** 待释放的 GPU 资源集合；材质与几何在多处共享，不能靠场景图自动回收 */
	private readonly resources = new Set<BufferGeometry | Material | Texture>();
	/** canvas 图标贴图缓存，同一种方式只生成一次 */
	private readonly iconTextures = new Map<FreightMode, CanvasTexture>();
	/** 以下向量/矩阵是 update 中复用的临时量，避免每帧产生新对象 */
	private readonly forward = new Vector3();
	private readonly normal = new Vector3();
	private readonly right = new Vector3();
	private readonly basis = new Matrix4();
	/** 置位后 update 直接返回，避免销毁后残留的帧回调访问已释放资源 */
	private disposed = false;

	constructor() {
		this.group.name = "global-freight";
		for (const mode of ["rail", "sea", "air"] as const) {
			this.modes[mode].name = `freight-${mode}`;
			this.group.add(this.modes[mode]);
		}
		// 铁路与海运各一条干线。speed 单位是「圈/秒」：
		// 铁路 0.014（约 71 秒走完）、海运 0.01（约 100 秒），
		// 保持海运最慢的相对节奏，与真实运速的量级关系一致。
		this.addRoute({
			id: "china-europe-rail",
			name: "上海—中亚—杜伊斯堡",
			mode: "rail",
			curve: new SurfaceRouteCurve(RAIL_WAYPOINTS),
			waypoints: RAIL_WAYPOINTS,
			speed: 0.014,
			offset: 0.24,
			height: 0,
		});
		this.addRoute({
			id: "shanghai-rotterdam-sea",
			name: "上海—马六甲—苏伊士—鹿特丹",
			mode: "sea",
			curve: new SurfaceRouteCurve(SEA_WAYPOINTS),
			waypoints: SEA_WAYPOINTS,
			speed: 0.01,
			offset: 0.12,
			height: 0,
		});
		for (const destination of AIR_DESTINATIONS)
			this.addRoute(
				{
					id: `beijing-${destination.id}-air`,
					name: `北京—${destination.name}`,
					mode: "air",
					curve: new AirRouteCurve(
						BEIJING,
						destination.coordinates,
						destination.height,
					),
					waypoints: [BEIJING, destination.coordinates],
					// 短途（height < 1，主要是东亚/东南亚）用 0.048，长途用 0.031，
					// 让两类航线的屏幕速度看起来接近，不会长短途割裂。
					speed: destination.height < 1 ? 0.048 : 0.031,
					offset: destination.offset,
					height: destination.height,
				},
				destination.vehicle,
			);
		this.update(0);
	}

	/** 登记待释放资源；返回原对象，便于在 new 表达式里就地包裹 */
	private keep<T extends BufferGeometry | Material | Texture>(resource: T): T {
		this.resources.add(resource);
		return resource;
	}

	/**
	 * 构建一条完整航线：底线几何 + 流动光带 + 可选载具 + 两端端点标记。
	 * @param data 除运行时状态（tail / progress / vehicle）外的航线描述
	 * @param withVehicle 是否生成移动图标，默认生成
	 */
	private addRoute(
		data: Omit<Route, "tail" | "progress" | "vehicle">,
		withVehicle = true,
	) {
		const group = this.modes[data.mode];
		// 空运弧曲率小，240 段足够；贴地航线弯折多，需要 800 段才不显棱角
		const segments = data.mode === "air" ? 240 : 800;
		// 空运底线用更亮的近白色，避免浅蓝叠在深色球面上发灰
		const lineColor = data.mode === "air" ? "#d1efff" : COLORS[data.mode];
		if (data.mode === "rail") this.addRailway(data.curve, group);
		else {
			// 海运管径 0.009、空运 0.008：海运略粗以便与空运细线区分
			const geometry = this.keep(
				new TubeGeometry(
					data.curve,
					segments,
					data.mode === "sea" ? 0.009 : 0.008,
					8,
					false,
				),
			);
			// 叠加混合让线像自发光；关闭深度写入，避免半透明管相互遮挡出现硬边
			const material = this.keep(
				new MeshBasicMaterial({
					color: lineColor,
					transparent: true,
					opacity: data.mode === "sea" ? 0.52 : 0.46,
					blending: AdditiveBlending,
					depthWrite: false,
				}),
			);
			group.add(new Mesh(geometry, material));
		}
		// 流动尾迹：在同一条曲线上再叠一层略粗的 Tube，用 shader 只点亮光头附近一段。
		// uniform 含义：head 为光头在曲线上的位置 ∈ [0, 1)；tailLength 为尾迹长度占比
		// （空运 0.14 更长，因为弧线本身更抽象）；color 预先乘 1.6 提亮，
		// 配合叠加混合才能盖过底层管线。head 只在 update 中改，不与几何重建耦合。
		const tail = this.keep(
			new ShaderMaterial({
				uniforms: {
					head: { value: data.offset },
					tailLength: { value: data.mode === "air" ? 0.14 : 0.09 },
					color: { value: new Color(lineColor).multiplyScalar(1.6) },
				},
				vertexShader: `varying float progress;
					void main() {
						progress = uv.x;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}`,
				fragmentShader: `varying float progress;
					uniform float head;
					uniform float tailLength;
					uniform vec3 color;
					void main() {
						float distanceBehind = fract(head - progress + 1.0);
						float light = pow(max(0.0, 1.0 - distanceBehind / tailLength), 1.7);
						gl_FragColor = vec4(color * (1.0 + light * 0.35), light * 0.9);
					}`,
				transparent: true,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		// 片元里 fract(head - progress + 1.0) 求「落后光头」的环形距离；
		// 加 1 是为了 head 从 1 回绕到 0 时尾迹仍然连续，不会瞬间闪断。
		// 1.7 次幂让衰减前沿更锐、尾巴更拖，pow 的底数截断到 0 防止负值。
		group.add(
			new Mesh(
				// 尾迹管比底线略粗（0.012 vs 0.008/0.009），形成可见的光晕包边
				this.keep(new TubeGeometry(data.curve, segments, 0.012, 8, false)),
				tail,
			),
		);
		const route: Route = { ...data, tail, progress: data.offset };
		if (withVehicle) {
			route.vehicle = this.makeVehicle(data.mode);
			group.add(route.vehicle);
		}
		this.routes.push(route);
		this.addTerminal(data.waypoints[0], data.mode);
		this.addTerminal(data.waypoints[data.waypoints.length - 1], data.mode);
	}

	/**
	 * 铁路专用几何：沿曲线横向偏移出左右两根钢轨，再按固定间隔铺枕木。
	 * 铁路不用单根 Tube，因为需要「双轨 + 横档」的轮廓辨识度。
	 * @param curve 贴地曲线
	 * @param group 铁路分组，几何直接挂入
	 */
	private addRailway(curve: Curve<Vector3>, group: Group) {
		const length = curve.getLength();
		// 约每 0.027 世界单位取一个采样，并设 180 段下限，
		// 防止短航线采样过疏、钢轨出现明显折角。
		const divisions = Math.max(180, Math.ceil(length / 0.027));
		const left: Vector3[] = [];
		const right: Vector3[] = [];
		const sleepers: number[] = [];
		const normal = new Vector3();
		const side = new Vector3();
		for (let index = 0; index <= divisions; index++) {
			const t = index / divisions;
			const point = curve.getPointAt(t);
			normal.copy(point).normalize();
			// side = 切线 × 法线，是球面切平面内垂直于前进方向的横向；
			// 两根钢轨分别沿 ±side 偏移，合计轨距 0.036 世界单位。
			side.crossVectors(curve.getTangentAt(t), normal).normalize();
			left.push(point.clone().addScaledVector(side, 0.018));
			right.push(point.clone().addScaledVector(side, -0.018));
			// 每 3 个采样放一根枕木，横向跨度 0.07，明显宽出两侧钢轨才像枕木
			if (index % 3 === 0) {
				const a = point.clone().addScaledVector(side, -0.035);
				const b = point.clone().addScaledVector(side, 0.035);
				sleepers.push(a.x, a.y, a.z, b.x, b.y, b.z);
			}
		}
		// 两根钢轨共用同一材质，减少渲染状态切换；0.0055 的管径保证远处仍可见
		const railMaterial = this.keep(
			new MeshBasicMaterial({
				color: COLORS.rail,
				transparent: true,
				opacity: 0.48,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		for (const points of [left, right])
			group.add(
				new Mesh(
					this.keep(
						new TubeGeometry(
							new CatmullRomCurve3(points),
							divisions,
							0.0055,
							4,
							false,
						),
					),
					railMaterial,
				),
			);
		// 枕木用 LineSegments：每两个顶点一段，一次 draw call 画完全部横档，
		// 比逐根建 Mesh 少上百个对象；透明度压低以免盖过钢轨主线。
		const ties = this.keep(new BufferGeometry());
		ties.setAttribute("position", new Float32BufferAttribute(sleepers, 3));
		group.add(
			new LineSegments(
				ties,
				this.keep(
					new LineBasicMaterial({
						color: COLORS.rail,
						transparent: true,
						opacity: 0.24,
						depthWrite: false,
					}),
				),
			),
		);
	}

	/**
	 * 在球面上放置一个端点标记（圆环 + 中心小球）。
	 * 同一坐标、同一方式只建一次，多条航线共用的枢纽不会叠出多层发光。
	 */
	private addTerminal(coordinates: Coordinates, mode: FreightMode) {
		// 共用同一枢纽的航线也共享它的标记，用坐标拼出的名字做去重键。
		const key = `terminal-${coordinates.join(",")}`;
		if (this.modes[mode].getObjectByName(key)) return;
		const terminal = new Group();
		terminal.name = key;
		// 抬高 0.003，略高于管中心线，避免与管心共面导致深度闪烁
		terminal.position.copy(spherical(coordinates, SURFACE_RADIUS + 0.003));
		// 圆环默认位于 XY 平面，需把 +Z 轴对齐到球面法线才能平贴地表
		terminal.quaternion.setFromUnitVectors(
			new Vector3(0, 0, 1),
			terminal.position.clone().normalize(),
		);
		const material = this.keep(
			new MeshBasicMaterial({
				color: COLORS[mode],
				transparent: true,
				opacity: 0.66,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		terminal.add(
			new Mesh(this.keep(new TorusGeometry(0.073, 0.008, 4, 32)), material),
			new Mesh(this.keep(new SphereGeometry(0.026, 8, 6)), material),
		);
		this.modes[mode].add(terminal);
	}

	/**
	 * 生成移动载具：一个始终面向相机的 Sprite 图标，
	 * 由外层 Group 负责位置与朝向，Sprite 只负责贴图与屏幕内旋转。
	 * 用 Sprite 而非贴地模型，是为了任何缩放级别下图标都清晰可读。
	 */
	private makeVehicle(mode: FreightMode) {
		const vehicle = new Group();
		vehicle.name = `moving-${mode}`;
		const icon = new Sprite(
			this.keep(
				new SpriteMaterial({
					map: this.iconTexture(mode),
					transparent: true,
					depthTest: true,
					depthWrite: false,
				}),
			),
		);
		// 三种图标视觉重量不同：飞机轮廓最细，所以缩放最小
		icon.scale.setScalar(mode === "rail" ? 0.46 : mode === "sea" ? 0.44 : 0.37);
		// 广告牌让图标始终面向屏幕，保证图形可读；但它绕视线轴的角度仍取自
		// 真实切线——地球自转与相机投影变化后，图标要继续指向航向前方。
		const projectedForward = new Vector3();
		icon.onBeforeRender = (_renderer, _scene, camera) => {
			// 世界 +Y 先转到载具局部（即航向），再转到相机空间；
			// 取 (-x, y) 求角度，因为屏幕 y 轴向上、Sprite 旋转以顺时针为正。
			projectedForward
				.copy(UP)
				.transformDirection(vehicle.matrixWorld)
				.transformDirection(camera.matrixWorldInverse);
			icon.material.rotation = Math.atan2(
				-projectedForward.x,
				projectedForward.y,
			);
		};
		vehicle.add(icon);
		return vehicle;
	}

	/**
	 * 用 canvas 直接绘制 128×128 圆底图标（火车 / 轮船 / 飞机），
	 * 结果按方式缓存到 iconTextures，每种只画一次。
	 * 不走图片资源是为了让图标配色直接取自 COLORS，调整主题色时自动同步。
	 */
	private iconTexture(mode: FreightMode) {
		const existing = this.iconTextures.get(mode);
		if (existing) return existing;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 128;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Freight icons require a 2D canvas context");
		// 深色圆底 + 主题色描边与外发光，保证图标在浅色陆地与深色海洋上都清晰
		context.shadowColor = COLORS[mode];
		context.shadowBlur = 12;
		context.beginPath();
		context.arc(64, 64, 47, 0, Math.PI * 2);
		context.fillStyle = "#06121d";
		context.fill();
		context.lineWidth = 6;
		context.strokeStyle = COLORS[mode];
		context.stroke();
		context.shadowBlur = 0;
		context.fillStyle = COLORS[mode];
		context.strokeStyle = COLORS[mode];
		context.lineWidth = 3;
		context.lineJoin = "round";
		// 以下三支分别绘制火车侧影、集装箱船俯视与飞机俯视；
		// 图形坐标全部按 128×128 画布手工定位，改动画布尺寸时需同步调整。
		if (mode === "rail") {
			context.beginPath();
			context.roundRect(44, 32, 40, 57, 9);
			context.fill();
			context.fillStyle = "#09202b";
			context.beginPath();
			context.roundRect(49, 40, 30, 20, 4);
			context.fill();
			for (const x of [52, 76]) {
				context.beginPath();
				context.arc(x, 76, 4, 0, Math.PI * 2);
				context.fill();
			}
			context.beginPath();
			context.moveTo(52, 88);
			context.lineTo(44, 99);
			context.moveTo(76, 88);
			context.lineTo(84, 99);
			context.moveTo(48, 95);
			context.lineTo(80, 95);
			context.stroke();
		} else if (mode === "sea") {
			context.beginPath();
			context.moveTo(64, 29);
			context.lineTo(85, 49);
			context.lineTo(84, 84);
			context.quadraticCurveTo(64, 100, 44, 84);
			context.lineTo(43, 49);
			context.closePath();
			context.fill();
			context.fillStyle = "#09202b";
			context.fillRect(54, 43, 20, 13);
			context.fillRect(52, 62, 10, 12);
			context.fillRect(66, 62, 10, 12);
			context.fillRect(52, 77, 10, 9);
			context.fillRect(66, 77, 10, 9);
		} else {
			context.beginPath();
			context.moveTo(64, 26);
			context.lineTo(70, 51);
			context.lineTo(95, 70);
			context.lineTo(95, 77);
			context.lineTo(70, 68);
			context.lineTo(70, 87);
			context.lineTo(80, 96);
			context.lineTo(80, 102);
			context.lineTo(64, 95);
			context.lineTo(48, 102);
			context.lineTo(48, 96);
			context.lineTo(58, 87);
			context.lineTo(58, 68);
			context.lineTo(33, 77);
			context.lineTo(33, 70);
			context.lineTo(58, 51);
			context.closePath();
			context.fill();
		}
		const texture = this.keep(new CanvasTexture(canvas));
		// 声明为 sRGB，否则图标颜色会比 COLORS 里定义的明显偏暗
		texture.colorSpace = SRGBColorSpace;
		this.iconTextures.set(mode, texture);
		return texture;
	}

	/**
	 * 逐帧推进全部航线：更新光头 uniform，并把载具摆到曲线对应位置。
	 * @param seconds 累计时间（秒），由主循环传入；用绝对时间而非增量，
	 * 切页/暂停恢复后进度不会漂移，也不会累积掉帧误差。
	 */
	update(seconds: number) {
		if (this.disposed) return;
		for (const route of this.routes) {
			// 双层取模把任意实数（含负时间）规整到 [0, 1)
			route.progress = (((seconds * route.speed + route.offset) % 1) + 1) % 1;
			route.tail.uniforms.head.value = route.progress;
			if (!route.vehicle) continue;
			// 用 getPointAt 按弧长采样，载具才会匀速；getPoint 是等参数，会忽快忽慢
			const point = route.curve.getPointAt(route.progress);
			this.forward.copy(route.curve.getTangentAt(route.progress)).normalize();
			this.normal.copy(point).normalize();
			// 以切线为前、球面法线为上叉乘出右向量，再正交化重建局部基，
			// 载具既能朝向航线，也不会因纬度升高而侧翻。
			this.right.crossVectors(this.forward, this.normal).normalize();
			this.normal.crossVectors(this.right, this.forward).normalize();
			this.basis.makeBasis(this.right, this.forward, this.normal);
			route.vehicle.quaternion.setFromRotationMatrix(this.basis);
			route.vehicle.position.copy(point);
			// 贴地航线沿法线再抬 0.065，避免图标半埋进地表；
			// 空运本身已在弧线上，无需额外偏移。
			if (route.mode !== "air")
				route.vehicle.position.addScaledVector(this.normal, 0.065);
		}
	}

	/** 按方式整体显隐：只切分组 visible，不销毁几何，随时可再打开 */
	setMode(mode: FreightMode, enabled: boolean) {
		this.modes[mode].visible = enabled;
	}

	/** 导出状态快照，供大屏侧栏统计或调试面板读取（返回新对象，不暴露内部引用） */
	getState() {
		return {
			enabled: {
				rail: this.modes.rail.visible,
				sea: this.modes.sea.visible,
				air: this.modes.air.visible,
			},
			routeCount: this.routes.length,
			vehicleCount: this.routes.filter((route) => route.vehicle).length,
			routes: this.routes.map((route) => ({
				id: route.id,
				name: route.name,
				mode: route.mode,
				enabled: this.modes[route.mode].visible,
				progress: route.progress,
				arcHeight: route.height,
				waypointCount: route.waypoints.length,
				vehiclePosition: route.vehicle?.position.toArray(),
				vehicleBearing: route.vehicle?.quaternion.toArray(),
			})),
		};
	}

	/**
	 * 释放全部 GPU 资源。
	 * 材质与几何在多处共享（如左右钢轨共用一个材质），因此按 resources 集合去重后
	 * 逐个 dispose，而不是遍历场景图；group.clear 只负责断开引用。
	 */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.group.removeFromParent();
		this.group.clear();
		for (const resource of this.resources) resource.dispose();
		this.resources.clear();
		this.iconTextures.clear();
	}
}

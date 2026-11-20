/**
 * 地图地坪：单次 draw call 绘制网格底板、分块面板、扫描带与流光，
 * 全部在片元着色器里按平面坐标程序化生成，因此下钻换区域时不需要重建几何体。
 * 暂未接入场景：全仓无引用，保留为地图地坪的备选实现。
 */
import { DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from "three";

/** 地坪覆盖范围；坐标与地图投影后的局部平面一致 */
export interface TerrainBounds {
	/** 中心点，使用地图投影后的局部 XY 坐标 */
	x: number;
	y: number;
	width: number;
	height: number;
	/** 该行政区挤出侧面与标记点使用的空间缩放，越小则细节越密 */
	scale: number;
}

/** 全国视图的默认范围：宽 15、高 10 的世界单位，是其它区域缩放的基准 */
const NATIONAL_BOUNDS: TerrainBounds = {
	x: 0,
	y: 0,
	width: 15,
	height: 10,
	scale: 1,
};

/**
 * 地坪片元着色器。
 * 构造顺序：底层渐变 → 分块面板明暗 → 三级网格 → 装饰性电路短线 → 扫过光带 → 车道流光 → 十字网格与点阵。
 * 所有图案都以 vPlane（相对区域最长边的归一化坐标）为基准，并借助 fwidth 让线宽随距离自适应，
 * 所以同一份 shader 在全国与区县尺度下都能保持相近的视觉密度。
 */
const FRAGMENT_SHADER = /* glsl */ `
	varying vec2 vPlane;
	uniform float time;
	uniform float reveal;


	float hash(vec2 p) {
		return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
	}

	float fineLine(float distance, float width) {
		float aa = max(fwidth(distance), .00015);
		return 1. - smoothstep(width, width + aa * 1.15, abs(distance));
	}

	float grid(vec2 p, float spacing, float width) {
		vec2 d = abs(fract(p / spacing - .5) - .5) * spacing;
		return fineLine(min(d.x, d.y), width);
	}

	float window(float p, float start, float end, float softness) {
		return smoothstep(start, start + softness, p)
			* (1. - smoothstep(end - softness, end, p));
	}

	void main() {
		// These coordinates are relative to the current region's longest side.
		// Pixel derivatives keep the details thin at every camera distance.
		vec2 p = vPlane * 1.12;
		float radius = length(p);
		float groundFade = 1. - smoothstep(.38, .86, radius);
		float innerFade = .55 + .45 * smoothstep(.13, .44, radius);

		vec2 tile = p / .14;
		vec2 tileId = floor(tile);
		vec2 tileUv = fract(tile) - .5;
		float tileSeed = hash(tileId);
		float inset = 1. - smoothstep(.445, .49, max(abs(tileUv.x), abs(tileUv.y)));
		float panel = (.13 + tileSeed * .87) * inset;
		float largerPanel = hash(floor(tile / 2.) + 19.);

		vec3 color = vec3(.005, .013, .029);
		color += vec3(.004, .010, .022) * panel;
		color += vec3(.002, .004, .010) * largerPanel;

		float minorGrid = grid(p, .035, .00028);
		float majorGrid = grid(p, .14, .00052);
		float lattice = grid(p + vec2(.0175), .28, .0004);
		color += vec3(.016, .052, .096) * minorGrid * .13;
		color += vec3(.022, .085, .154) * majorGrid * .18;
		color += vec3(.012, .035, .074) * lattice * .14;

		// Sparse corner markings and short circuit traces belong to the floor,
		// rather than adding fabricated roads or geographic features.
		float circuit = fineLine(tileUv.x - .29, .008)
			* window(tileUv.y, -.31, .18, .06) * step(.88, tileSeed);
		circuit += fineLine(tileUv.y + .31, .008)
			* window(tileUv.x, -.13, .3, .055) * step(.88, tileSeed);
		float cross = fineLine(tileUv.x + .28, .006)
			* window(tileUv.y, .19, .35, .025);
		cross += fineLine(tileUv.y - .27, .006)
			* window(tileUv.x, -.36, -.2, .025);
		cross *= step(.79, hash(tileId + 7.3));
		color += vec3(.025, .12, .18) * (circuit * .16 + cross * .18);

		// A broad, dim sweep reveals the grid without washing out the map.
		float scanPosition = mod(time * .052 + .6, 2.4) - 1.2;
		float scanDistance = p.y + p.x * .18 - scanPosition;
		float scan = exp(-abs(scanDistance) * 26.);
		color += vec3(.011, .047, .082) * scan * (.22 + majorGrid * .33);
		color += vec3(.026, .090, .135) * fineLine(scanDistance, .0007) * .06;

		// Only a few grid lanes carry moving glints. They are computed here,
		// so drilldown needs neither new line geometries nor particle pools.
		float horizontalLane = floor(p.y / .14);
		float hSeed = hash(vec2(horizontalLane, 32.));
		float hTravel = mod(p.x - time * .078 + hSeed * 2.4, 2.4);
		float hTrack = fineLine(fract(p.y / .14) * .14 - .042, .0007);
		float horizontal = hTrack * window(hTravel, .08, .25, .018)
			* smoothstep(.08, .25, hTravel) * step(.85, hSeed);
		float verticalLane = floor(p.x / .14);
		float vSeed = hash(vec2(verticalLane, 74.));
		float vTravel = mod(p.y + time * .057 + vSeed * 2.4, 2.4);
		float vTrack = fineLine(fract(p.x / .14) * .14 - .098, .0007);
		float vertical = vTrack * window(vTravel, .12, .23, .015)
			* (1. - smoothstep(.12, .23, vTravel)) * step(.89, vSeed);
		color += vec3(.055, .235, .29) * (horizontal + vertical) * .34;

		// The original China dashboard's cross grid and regular dotted ground.
		vec2 crossUv = fract(p / .14 + .5) - .5;
		float crossGrid = fineLine(crossUv.x, .006) * window(crossUv.y, -.07, .07, .004)
			+ fineLine(crossUv.y, .006) * window(crossUv.x, -.07, .07, .004);
		vec2 pointUv = fract(p / .012) - .5;
		float dots = 1. - smoothstep(.045, .13, length(pointUv));
		color += vec3(.028, .12, .21) * crossGrid * .5;
		color += vec3(.016, .09, .16) * dots * .25;

		float alpha = groundFade * innerFade * reveal * .82;
		if (alpha < .003) discard;
		gl_FragColor = vec4(color, alpha);
		#include <colorspace_fragment>
	}
`;

/**
 * 地坪网格与扫描效果。
 * 暂未接入场景；接入时把 group 加入地图的局部 XY 组，父级需提供 rotation.x = -PI/2 把平面放平。
 * 仅在中国视图可见时调用 update 传秒数，避免看不见时仍有 uniform 与 draw call 开销。
 */
export default class MapTerrain {
	/** 对外挂载点，位置与缩放随 setRegion 变化 */
	readonly group = new Group();
	/** 单位平面，实际尺寸由 plane.scale 拉伸，缩放到任意区域都无需新建几何体 */
	private readonly geometry = new PlaneGeometry(2, 2);
	private readonly material = new ShaderMaterial({
		uniforms: {
			/** 累计动画时间（秒），已乘以动画速率 */
			time: { value: 0 },
			/** 0.55 → 1 的显影系数，切换区域时重新从半透明淡入 */
			reveal: { value: 1 },
		},
		// vPlane 直接取顶点局部坐标（[-1,1]），与贴图无关，便于按区域尺寸归一化
		vertexShader: /* glsl */ `
			varying vec2 vPlane;
			void main() {
				vPlane = position.xy;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
			}
		`,
		fragmentShader: FRAGMENT_SHADER,
		// 双面渲染 + 单 pass：地坪可能被相机从下方看到一点，但不需要两次绘制
		transparent: true,
		depthTest: true,
		depthWrite: false,
		side: DoubleSide,
		forceSinglePass: true,
		toneMapped: false,
	});
	private readonly plane = new Mesh(this.geometry, this.material);
	/** 时间流逝速率；小区域略慢，避免扫描线在其上显得过快 */
	private animationRate = 1;
	/** 自上次切换区域以来经过的秒数，用于计算淡入显影 */
	private revealAge = 1;
	/** 上一帧的时间戳（秒），用于求 delta；首帧为 undefined */
	private previousSeconds: number | undefined;
	/** 释放标记，防止释放后仍被场景更新 */
	private disposed = false;

	constructor() {
		this.group.name = "MapTerrain";
		this.plane.name = "MapTerrainFloor";
		// 负的 renderOrder 保证地坪先于地图轮廓绘制，作为背景而不是遮挡物
		this.plane.renderOrder = -2;
		// 地坪不参与拾取：射线检测直接返回空，避免挡住省份点击
		this.plane.raycast = () => undefined;
		this.group.add(this.plane);
		this.setRegion();
	}

	/**
	 * 切换到某个行政区的地坪范围，同时重置淡入动画。
	 * 所有入参都做有限性校验并取绝对值，防止上游数据缺失导致 NaN 传播到矩阵。
	 */
	setRegion(bounds: TerrainBounds = NATIONAL_BOUNDS): void {
		if (this.disposed) return;
		const width = Number.isFinite(bounds.width) ? Math.abs(bounds.width) : 15;
		const height = Number.isFinite(bounds.height)
			? Math.abs(bounds.height)
			: 10;
		// 以最长边作为平面尺寸基准，保证不规则行政区的图案密度一致
		const span = Math.max(width, height, 0.001);
		const scale = Number.isFinite(bounds.scale)
			? Math.max(0.0001, Math.abs(bounds.scale))
			: Math.min(1, span / 15);
		this.group.position.set(
			Number.isFinite(bounds.x) ? bounds.x : 0,
			Number.isFinite(bounds.y) ? bounds.y : 0,
			// 略微压到地图平面之下，避免与省界共面产生 z-fighting
			-0.08 * scale,
		);
		this.plane.scale.set(span * 1.12, span * 1.12, 1);
		// 坐标本身随平面缩放，因此小区域保留同样的屏幕细节，只是扫描节奏略慢
		this.animationRate = 0.84 + 0.16 * Math.sqrt(Math.min(scale, 1));
		this.revealAge = 0;
		this.material.uniforms.reveal.value = 0.55;
	}

	/**
	 * 推进时间 uniform 与显影动画。
	 * @param seconds 单调递增的秒数（通常来自渲染循环的 clock）
	 */
	update(seconds: number): void {
		if (this.disposed || !this.group.visible || !Number.isFinite(seconds))
			return;
		// 首帧没有参照，按 60fps 估一个 delta；单帧最多按 100ms 计，防止后台切换回来时光带瞬移
		const delta =
			this.previousSeconds === undefined
				? 1 / 60
				: Math.min(0.1, Math.max(0, seconds - this.previousSeconds));
		this.previousSeconds = seconds;
		this.revealAge += delta;
		this.material.uniforms.time.value = seconds * this.animationRate;
		// 指数收敛：约 0.6 秒走完大半，避免线性淡入显得生硬
		this.material.uniforms.reveal.value =
			0.55 + 0.45 * (1 - Math.exp(-this.revealAge * 5));
	}

	/** 从父级摘除并释放几何体与材质，可重复调用 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.group.removeFromParent();
		this.group.clear();
		this.geometry.dispose();
		this.material.dispose();
	}
}

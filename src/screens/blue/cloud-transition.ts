/**
 * 云层遮罩转场：在「全球 / 中国」视图切换时用一团横向掠过的云雾盖住旧画面，
 * 遮罩完全覆盖视口的瞬间由上层完成场景切换，再让云雾继续飘走露出新画面。
 * 由 world/frame 在后期合成之后叠加渲染，不需要额外的渲染目标。
 */
import {
	type Camera,
	DataTexture,
	LinearFilter,
	Mesh,
	PlaneGeometry,
	RedFormat,
	RepeatWrapping,
	Scene,
	ShaderMaterial,
	UnsignedByteType,
	type WebGLRenderer,
} from "three";

/**
 * 预烘焙一张可平铺的分形值噪声图（R8，256×128）。
 * 只生成一次并长期复用：片元着色器每帧只需采样，避免在 GPU 里重复计算多层噪声。
 * 四个倍频（4/8/16/32 列）按权重叠加，得到既有大团块又有细碎边缘的云形。
 */
function createCloudNoise() {
	const width = 256;
	const height = 128;
	// 固定种子的 xorshift，保证每次刷新得到同一张噪声，转场观感稳定
	let seed = 0x71384a1;
	const random = () => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 4294967296;
	};
	// 低频占主导、高频只做细节，避免云看起来像均匀噪点
	const weights = [0.52, 0.27, 0.14, 0.07];
	const layers = [4, 8, 16, 32].map((columns, index) => {
		// 行数为列数的一半，配合 2:1 的纹理比例让格子接近正方形
		const rows = columns / 2;
		const grid = new Float32Array(columns * rows);
		for (let offset = 0; offset < grid.length; offset++)
			grid[offset] = random();
		return { columns, rows, grid, weight: weights[index] };
	});
	const data = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let value = 0;
			for (const { columns, rows, grid, weight } of layers) {
				const gx = ((x + 0.5) / width) * columns;
				const gy = ((y + 0.5) / height) * rows;
				const x0 = Math.floor(gx);
				const y0 = Math.floor(gy);
				// 索引用取模回绕，保证左右/上下边缘无缝，RepeatWrapping 才不会露接缝
				const x1 = (x0 + 1) % columns;
				const y1 = (y0 + 1) % rows;
				const fx = gx - x0;
				const fy = gy - y0;
				// smoothstep 缓动插值权重，否则格子边界会出现明显的菱形棱角
				const sx = fx * fx * (3 - 2 * fx);
				const sy = fy * fy * (3 - 2 * fy);
				const top =
					grid[y0 * columns + x0] * (1 - sx) + grid[y0 * columns + x1] * sx;
				const bottom =
					grid[y1 * columns + x0] * (1 - sx) + grid[y1 * columns + x1] * sx;
				value += (top * (1 - sy) + bottom * sy) * weight;
			}
			// 以 0.5 为中心做 1.4 倍对比度拉伸，让云团边缘更利落
			data[y * width + x] = Math.round(
				Math.min(1, Math.max(0, 0.5 + (value - 0.5) * 1.4)) * 255,
			);
		}
	}
	const texture = new DataTexture(
		data,
		width,
		height,
		RedFormat,
		UnsignedByteType,
	);
	texture.minFilter = texture.magFilter = LinearFilter;
	texture.wrapS = texture.wrapT = RepeatWrapping;
	// 噪声靠重复平铺而不是缩小查看，生成 mipmap 只会额外占显存
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

/**
 * 云层转场遮罩。
 * 用一个全屏四边形加程序化云 shader，在最终画面之上做 alpha 混合；
 * progress 从 0 到 1 表示云团从屏幕左外侧扫到右外侧，0.5 时恰好盖满整个视口。
 */
export default class CloudTransition {
	/** 0 → 1 的扫过进度，作为共享 uniform 直接交给 shader，不经过额外拷贝 */
	readonly progress = { value: 0 };
	/** 全屏 overlay 专用场景，只有一块平面 */
	private readonly scene = new Scene();
	/** 预烘焙的噪声图，生命周期与本类一致 */
	private readonly noise = createCloudNoise();
	/** 2×2 平面：顶点着色器直接输出裁剪坐标，因此尺寸与世界坐标无关 */
	private readonly geometry = new PlaneGeometry(2, 2);
	private readonly material = new ShaderMaterial({
		uniforms: {
			progress: this.progress,
			noiseMap: { value: this.noise },
		},
		vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = vec4(position.xy, 0., 1.);
			}
		`,
		fragmentShader: `
			uniform float progress;
			uniform sampler2D noiseMap;
			varying vec2 vUv;
			void main() {
				float centerX = mix(-1.35, 2.35, progress);
				float localX = vUv.x - centerX;
				if (abs(localX) > 1.24) discard;

				// Every sample follows the cloud bank, rather than the screen below it.
				vec2 q = vec2(localX * .45, vUv.y * .62) + vec2(.31, .13);
				float n0 = texture2D(noiseMap, q).r;
				float n1 = texture2D(noiseMap, q * 1.9 + vec2(.21, .32)).r;
				float n2 = texture2D(noiseMap, q * 3.7 + vec2(.62, .15)).r;
				float warp = .024 * sin(vUv.y * 17. + localX * 2.)
					+ .016 * (2. * n1 - 1.);
				float distance = abs(localX + warp);
				float core = 1. - smoothstep(.85, .93, distance);
				float fringe = 1. - smoothstep(.85, 1.20, distance);
				float wisps = smoothstep(.30, .65, n1 * .58 + n2 * .42);
				float alpha = max(core, fringe * wisps);
				if (alpha < .001) discard;

				// Warp is bounded by .04. At progress=.5, distance <= .54,
				// so core and alpha are exactly 1 across the whole viewport.
				// At progress=0/1, distance >= 1.31 and the bank is offscreen.
				float density = n0 * .55 + n1 * .30 + n2 * .15;
				float nLight = texture2D(noiseMap, q + vec2(-.012, .018)).r;
				float lighting = clamp((nLight - n0) * 5., -.22, .22);
				float shade = clamp(.28 + density * .65 + lighting, 0., 1.);
				vec3 color = mix(vec3(.56, .65, .73), vec3(.94, .97, 1.), shade);
				float rim = smoothstep(.60, 1.20, distance) * (.06 + n2 * .04);
				color += vec3(.035, .045, .055) * rim;
				// These are display-space colors, composited after the output pass.
				gl_FragColor = vec4(color, alpha);
			}
		`,
		// 关闭深度测试与色调映射：遮罩是最终画面之上的 2D 叠加，颜色已是显示空间
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	/** 承载 shader 的平面；frustumCulled 关闭，否则裁剪会因顶点直接写裁剪空间而失效 */
	private readonly plane = new Mesh(this.geometry, this.material);
	/** 释放标记，防止重复 dispose 以及释放后的渲染调用 */
	private disposed = false;

	constructor() {
		this.plane.frustumCulled = false;
		this.scene.add(this.plane);
	}

	/** 仅当进度在 (0,1) 区间且未释放时才需要绘制；端点值可跳过整次 draw call */
	get active() {
		return !this.disposed && this.progress.value > 0 && this.progress.value < 1;
	}

	/**
	 * 在后期合成完成、画面已写入屏幕后调用。
	 * 顶点着色器忽略投影矩阵，所以这里传入的 camera 只用于满足渲染接口。
	 */
	render(renderer: WebGLRenderer, camera: Camera) {
		if (!this.active) return;
		// 临时关闭自动清屏，保留合成结果作为背景，否则会把整帧擦掉
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		try {
			renderer.render(this.scene, camera);
		} finally {
			renderer.autoClear = autoClear;
		}
	}

	/** 立刻撤掉遮罩（例如过渡被中断），不播放收尾动画 */
	clear() {
		this.progress.value = 0;
	}

	/** 释放几何体、材质、噪声贴图并从场景摘除，可重复调用 */
	dispose() {
		if (this.disposed) return;
		this.clear();
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
		this.noise.dispose();
		this.scene.remove(this.plane);
	}
}

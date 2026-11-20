/**
 * 帧缓冲快照过渡。
 * 在地图数据切换前把当前画面拷贝成一张纹理，再以「重投影 + 淡出」的方式
 * 叠在新场景之上，让旧地图沿同一地平面平滑溶解，避免两套场景同时渲染。
 * 当前未接入：全仓无引用，保留为下钻快照溶解的备选实现。
 */
import {
	FramebufferTexture,
	LinearFilter,
	Matrix4,
	Mesh,
	type Object3D,
	type PerspectiveCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	Vector2,
	type WebGLRenderer,
} from "three";

/**
 * 单张全屏快照的溶解层。
 * 生命周期：capture 抓帧 → 上层切换场景 → 每帧 render 逐渐降低 opacity → clear 释放纹理。
 * 任一时刻最多只持有一张 FramebufferTexture，显存占用由 viewport 尺寸决定。
 */
export default class FrameTransition {
	/** 快照的不透明度，从 1 线性/缓动递减到 0；由外部 tween 驱动 */
	readonly opacity = { value: 0 };
	/** 全屏叠加专用场景 */
	private readonly scene = new Scene();
	/** 2×2 平面，配合直接输出裁剪坐标的顶点着色器铺满视口 */
	private readonly geometry = new PlaneGeometry(2, 2);
	/** 抓帧瞬间的 view-projection，用于把屏幕像素反投影成世界射线 */
	private readonly capturedViewProjection = new Matrix4();
	/** 抓帧瞬间的地图模型矩阵，用于把世界坐标换算回当时的地理局部坐标 */
	private readonly capturedMapMatrix = new Matrix4();
	/** 当前帧的 view-projection，每帧重算，作为反投影的起点 */
	private readonly currentViewProjection = new Matrix4();
	/** 当前地图模型矩阵的逆，用于把射线命中的平面点换回旧地图的局部空间 */
	private readonly inverseMapMatrix = new Matrix4();
	private readonly material = new ShaderMaterial({
		uniforms: {
			snapshot: { value: null as FramebufferTexture | null },
			opacity: this.opacity,
			inverseViewProjection: { value: new Matrix4() },
			sourceProjection: { value: new Matrix4() },
			planeHeight: { value: 0 },
		},
		vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = vec4(position.xy, 0., 1.);
			}
		`,
		fragmentShader: `
			uniform sampler2D snapshot;
			uniform float opacity;
			uniform mat4 inverseViewProjection;
			uniform mat4 sourceProjection;
			uniform float planeHeight;
			varying vec2 vUv;
			void main() {
				vec2 clip = vUv * 2. - 1.;
				vec4 nearPoint = inverseViewProjection * vec4(clip, -1., 1.);
				vec4 farPoint = inverseViewProjection * vec4(clip, 1., 1.);
				vec3 origin = nearPoint.xyz / nearPoint.w;
				vec3 ray = farPoint.xyz / farPoint.w - origin;
				if (abs(ray.y) < .00001) discard;
				float distance = (planeHeight - origin.y) / ray.y;
				if (distance < 0.) discard;
				vec4 source = sourceProjection * vec4(origin + ray * distance, 1.);
				if (source.w <= 0.) discard;
				vec2 sourceUv = source.xy / source.w * .5 + .5;
				vec2 edge = smoothstep(vec2(0.), vec2(.018), sourceUv)
					* smoothstep(vec2(0.), vec2(.018), 1. - sourceUv);
				vec4 frame = texture2D(snapshot, clamp(sourceUv, 0., 1.));
				gl_FragColor = vec4(frame.rgb, frame.a * opacity * edge.x * edge.y);
			}
		`,
		// 快照已是显示空间颜色，禁止再次参与色调映射与深度写入
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	/** 承载快照的叠加平面，关闭视锥裁剪以免被整体剔除 */
	private readonly plane = new Mesh(this.geometry, this.material);
	/** 复用尺寸对象，避免每帧分配 Vector2 */
	private readonly size = new Vector2();
	/** 当前持有的快照纹理；undefined 表示没有正在播放的过渡 */
	private texture: FramebufferTexture | undefined;
	/** 释放标记，释放后 capture / render 直接返回 */
	private disposed = false;

	constructor() {
		this.plane.frustumCulled = false;
		this.scene.add(this.plane);
	}

	/** 有纹理即视为激活，与 opacity 无关，便于外部判断是否需要继续渲染 */
	get active() {
		return this.texture !== undefined;
	}

	/** 快照纹理的显存估算（RGBA 每像素 4 字节），供性能面板展示 */
	get bytes() {
		return this.texture
			? this.texture.image.width * this.texture.image.height * 4
			: 0;
	}

	/**
	 * 抓取当前帧作为快照。
	 * 必须在后期合成与所有叠加层都渲染完之后调用，否则抓到的是未完成 bloom 的画面。
	 * @param renderer 当前 WebGL 渲染器，快照直接拷自其默认帧缓冲
	 * @param camera 抓帧时的相机，用于记录当时的投影矩阵
	 * @param map 地图根对象，记录其模型矩阵以支持后续重投影
	 * @returns 是否成功抓到有效快照
	 */
	capture(renderer: WebGLRenderer, camera: PerspectiveCamera, map: Object3D) {
		if (this.disposed) return false;
		renderer.getDrawingBufferSize(this.size);
		// 尺寸为 0 通常发生在页面隐藏或容器折叠时，此时拷贝会得到无效纹理
		if (this.size.x < 1 || this.size.y < 1) return false;
		// 每次过渡新建一张纹理：尺寸可能随窗口变化，复用旧尺寸会拉伸
		const texture = new FramebufferTexture(this.size.x, this.size.y);
		texture.minFilter = texture.magFilter = LinearFilter;
		// 帧缓冲里已是显示空间的 sRGB 字节；贴图不打标记、shader 也不做色彩转换，
		// 两边同时省略才能原样还原，否则颜色会被二次编码而发灰。
		try {
			renderer.copyFramebufferToTexture(texture);
		} catch (error) {
			// 拷贝失败时立刻释放，避免异常路径泄漏显存
			texture.dispose();
			throw error;
		}
		this.texture?.dispose();
		// 这里必须强制刷新矩阵：抓帧发生在本帧渲染之后，缓存可能仍是上一帧的
		camera.updateMatrixWorld();
		map.updateWorldMatrix(true, false);
		this.capturedViewProjection.multiplyMatrices(
			camera.projectionMatrix,
			camera.matrixWorldInverse,
		);
		this.capturedMapMatrix.copy(map.matrixWorld);
		this.texture = texture;
		this.material.uniforms.snapshot.value = texture;
		this.opacity.value = 1;
		return true;
	}

	/**
	 * 叠加渲染快照。
	 * 必须在后期处理之后调用，否则快照会被再次 bloom 而出现重影。
	 * @param planeHeight 地图地平面在 y 轴上的高度（世界坐标），用于射线求交
	 */
	render(
		renderer: WebGLRenderer,
		camera: PerspectiveCamera,
		map: Object3D,
		planeHeight: number,
	) {
		if (!this.active || this.opacity.value <= 0 || this.disposed) return;
		camera.updateMatrixWorld();
		map.updateWorldMatrix(true, false);
		this.currentViewProjection.multiplyMatrices(
			camera.projectionMatrix,
			camera.matrixWorldInverse,
		);
		this.material.uniforms.inverseViewProjection.value
			.copy(this.currentViewProjection)
			.invert();
		this.inverseMapMatrix.copy(map.matrixWorld).invert();
		// 经过「当前屏幕 → 世界 → 旧地图局部 → 旧相机投影」的重投影，
		// 缩放、倾斜与旋转时旧帧会贴着同一块地面跟随新地图，而不是钉在屏幕上。
		this.material.uniforms.sourceProjection.value
			.copy(this.capturedViewProjection)
			.multiply(this.capturedMapMatrix)
			.multiply(this.inverseMapMatrix);
		this.material.uniforms.planeHeight.value = planeHeight;
		// 关闭自动清屏以保留已合成画面，只做 alpha 叠加
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		try {
			renderer.render(this.scene, camera);
		} finally {
			renderer.autoClear = autoClear;
		}
	}

	/** 撤下快照并立即释放纹理；过渡结束或被打断时都要调用 */
	clear() {
		this.opacity.value = 0;
		this.material.uniforms.snapshot.value = null;
		this.texture?.dispose();
		this.texture = undefined;
	}

	/** 释放平面、材质与纹理，可重复调用 */
	dispose() {
		if (this.disposed) return;
		this.clear();
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
		this.scene.remove(this.plane);
	}
}

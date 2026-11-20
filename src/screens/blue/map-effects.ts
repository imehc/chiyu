/**
 * 中国地图叠加特效层：地面波纹、旋转光圈、边界点阵、光柱、散点、飞线与监测点。
 * 所有坐标都在「当前地图的局部 XY 平面」内（z 向上），由地图装配层在切换区域时
 * 调用 setRegion() 重新定位、startExit()/cancelExit() 控制出入场，
 * 主循环每帧调用 update(秒) 推进 time / entrance / reveal 三个共享 uniform。
 * 内部结构：贴图（图片 + canvas 生成）→ 材质（Basic / Shader）
 * → 动画（共享 uniform 对象 + 旋转/脉冲列表）。
 */
import {
	AdditiveBlending,
	BoxGeometry,
	BufferGeometry,
	CanvasTexture,
	Color,
	CurvePath,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	LineCurve3,
	Mesh,
	MeshBasicMaterial,
	type Object3D,
	PlaneGeometry,
	RepeatWrapping,
	ShaderMaterial,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
	TubeGeometry,
	Vector2,
	Vector3,
} from "three";

/**
 * 静态贴图路径，均为 public/texture 下的 PNG：
 * path/flyline 用作流动光带的纹理，glow 为柔光底，
 * focus* 系列是重点标记的底光、旋转环、箭头与脉冲圆。
 */
const texturePaths = {
	path: "/texture/pathLine2.png",
	flyline: "/texture/flyline6.png",
	glow: "/texture/huiguang.png",
	focusArrows: "/texture/focus/focus_arrows.png",
	focusBar: "/texture/focus/focus_bar.png",
	focusBg: "/texture/focus/focus_bg.png",
	focusRing: "/texture/focus/focus_mid_quan.png",
	focusPulse: "/texture/focus/focus_move_bg.png",
};
/** 贴图键：文件贴图的键名，外加三张运行时用 canvas 画出来的标记贴图 */
type TextureKey =
	| keyof typeof texturePaths
	| "point"
	| "scatter"
	| "scatterCore";

/** 入场动画总时长（秒）：entrance 在这段时间内缓出到 1，reveal 只用前 1.3 秒淡入 */
const ENTRANCE_DURATION = 4.8;

/** 中国大屏贴图与特效，坐标统一取当前地图的局部 XY 平面。 */
export default class MapEffects {
	readonly group = new Group();
	/** 贴图池；同色同图的所有面片共享，dispose 时统一释放 */
	private readonly textures = new Map<TextureKey, Texture>();
	/** stroke() 动态生成的边界遮罩，随区域重建而失效，单独管理生命周期 */
	private readonly boundaryTextures = new Set<Texture>();
	/** 以下 uniform 都是对象引用，直接交给多个材质共享，改 value 即可全局生效 */
	private readonly time = { value: 0 };
	/** 旋转角速度，0.0707 rad/s ≈ 4.05°/s，约 89 秒转一圈（缓慢才不喧宾夺主） */
	private readonly rotationSpeed = { value: 0.07068583 };
	private readonly rotationAngle = { value: 0 };
	/** 总显隐系数：入场淡入、退场淡出都靠它，shader 里乘在最终 alpha 上 */
	private readonly reveal = { value: 0 };
	/** 入场缩放系数：0 → 1，同时用作半径归一化的分母 */
	private readonly entrance = { value: 0 };
	/** 需要逐帧自转的面片；speed 为角速度倍率，负值表示反向转 */
	private readonly rotations: { mesh: Mesh; speed: number }[] = [];
	/** 需要循环扩散的脉冲面片；offset 让多个脉冲错峰出现 */
	private readonly pulses: {
		mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
		offset: number;
	}[] = [];
	/** 地面波纹所在平面的 z 值；区域切换时由 setRegion 重置 */
	private readonly waveHeight = { value: -0.62 };
	/** 内部计时（秒），从 restartEntrance 起重新累计，与全局 time 分离 */
	private age = 0;
	/** 入场延迟，让同一屏幕上的多个特效错开出场 */
	private entranceDelay = 0;
	private exiting = false;
	/** 退场开始时锁定的 reveal/entrance 比例，保证淡出与缩小同步 */
	private exitRevealScale = 1;
	/** 上一帧的时间戳；为 undefined 时首帧 delta 视为 0，避免切换区域时跳变 */
	private previousSeconds: number | undefined;
	private disposed = false;
	private loaded = false;

	/**
	 * 异步加载图片贴图，生成 canvas 标记贴图，并构建整个环境。
	 * 幂等：重复调用直接返回；加载过程中若已 dispose，则丢弃刚拿到的贴图。
	 */
	async load() {
		if (this.loaded) return;
		const loader = new TextureLoader();
		// 并行加载全部贴图；任一失败会 reject，调用方需自行兜底
		await Promise.all(
			Object.entries(texturePaths).map(async ([name, path]) => {
				const texture = await loader.loadAsync(path);
				// 加载完成时组件可能已卸载，此处必须自行释放，否则 GPU 纹理泄漏
				if (this.disposed) {
					texture.dispose();
					return;
				}
				texture.colorSpace = SRGBColorSpace;
				this.textures.set(name as TextureKey, texture);
			}),
		);
		if (this.disposed) return;
		this.createMarkerTextures();
		// path/flyline 需要通过 offset 滚动或平铺来表现流动，必须先开 RepeatWrapping
		for (const key of ["path", "flyline"] as const) {
			const texture = this.texture(key);
			texture.wrapS = texture.wrapT = RepeatWrapping;
		}
		// repeat = (0.5, 2)：U 方向半次、V 方向两次平铺，
		// 配合 update 里对 offset.x 的滚动，形成疏密合适的流动带。
		this.texture("flyline").repeat.set(0.5, 2);
		this.createEnvironment();
		this.loaded = true;
	}

	/** 取已加载贴图；load 完成前调用会拿到 undefined（类型上断言为非空） */
	private texture(key: TextureKey) {
		return this.textures.get(key) as Texture;
	}

	/** 把贴图池暴露给地图主体，供其绘制航线/热力等共用同一批纹理 */
	get sharedTextures() {
		return this.textures.values();
	}

	/**
	 * 生成三张 128×128 的 canvas 标记贴图，避免为小图标额外请求图片资源：
	 * point 为菱形产业图标，scatter 为柔光圆斑，scatterCore 为中心亮核。
	 */
	private createMarkerTextures() {
		for (const key of ["point", "scatter", "scatterCore"] as const) {
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 128;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Unable to draw map markers.");
			// 菱形用线性渐变模拟金属反光，两张圆形贴图用径向渐变做光晕
			if (key === "point") {
				context.beginPath();
				context.moveTo(64, 8);
				context.lineTo(120, 64);
				context.lineTo(64, 120);
				context.lineTo(8, 64);
				context.closePath();
				const fill = context.createLinearGradient(0, 8, 0, 120);
				fill.addColorStop(0, "#168cd4");
				fill.addColorStop(1, "#075185");
				context.fillStyle = fill;
				context.shadowColor = "#28bbff";
				context.shadowBlur = 10;
				context.fill();
				context.strokeStyle = "#53c9ff";
				context.lineWidth = 3;
				context.stroke();
				context.shadowBlur = 0;
				// 蓝色菱形内部的白色工业剪影，代表监测/产业点位
				context.fillStyle = "#efffff";
				context.beginPath();
				context.moveTo(37, 86);
				context.lineTo(37, 66);
				context.lineTo(52, 55);
				context.lineTo(52, 67);
				context.lineTo(68, 55);
				context.lineTo(68, 68);
				context.lineTo(89, 68);
				context.lineTo(89, 86);
				context.closePath();
				context.fill();
				context.fillRect(73, 43, 10, 27);
				context.fillStyle = "#1274b5";
				for (const x of [44, 61, 78]) context.fillRect(x, 74, 6, 7);
			} else if (key === "scatterCore") {
				// 中心亮核：白芯到 0.8 半径处已完全透明，靠叠加混合形成小亮点
				const core = context.createRadialGradient(64, 64, 0, 64, 64, 64);
				core.addColorStop(0, "#ffffff");
				core.addColorStop(0.48, "#efffff");
				core.addColorStop(0.62, "#9ffff0d9");
				core.addColorStop(0.8, "#6fffdc00");
				core.addColorStop(1, "#6fffdc00");
				context.fillStyle = core;
				context.fillRect(0, 0, 128, 128);
			} else {
				// 外圈柔光斑：八位十六进制末两位即 alpha，0.42 处已近乎全透明
				const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
				glow.addColorStop(0, "#efffff");
				glow.addColorStop(0.1, "#cafff5");
				glow.addColorStop(0.2, "#79ffe49c");
				glow.addColorStop(0.42, "#34efcb18");
				glow.addColorStop(1, "#34efcb00");
				context.fillStyle = glow;
				context.fillRect(0, 0, 128, 128);
			}
			const texture = new CanvasTexture(canvas);
			texture.colorSpace = SRGBColorSpace;
			this.textures.set(key, texture);
		}
	}

	/**
	 * 生成一张贴图面片，默认落在局部 XY 平面内。
	 * 统一关闭 depthWrite 并使用叠加混合，避免多层半透明面片互相切割出硬边；
	 * DoubleSide 让面片从地图背面视角看也仍然可见。
	 * @param size 面片边长（局部坐标单位），实际像素尺寸由调用方决定
	 * @param opacity 基础不透明度，脉冲类面片会在 update 中再改
	 */
	private plane(key: TextureKey, size: number, opacity = 1, color = "#b8dcff") {
		return new Mesh(
			new PlaneGeometry(size, size),
			new MeshBasicMaterial({
				map: this.texture(key),
				color,
				opacity,
				transparent: true,
				side: DoubleSide,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
	}

	/** 组装环境层：地面径向扩散、环形刻痕，并调用 setRegion 完成首次定位 */
	private createEnvironment() {
		this.group.name = "ChinaDashboardEffects";
		this.createGroundRipples();
		// 34×34 覆盖整个视野，顶点着色器把整片平面压到固定高度 height 上；
		// 片元以 10.5 秒为周期把 phase 归一，半径从 3.2 扩散到 12.2，
		// 用高斯带 (exp) 与极细亮线 (fine) 叠加出向外推开的水波。
		const wave = new Mesh(
			new PlaneGeometry(34, 34),
			new ShaderMaterial({
				uniforms: {
					time: this.time,
					reveal: this.reveal,
					height: this.waveHeight,
				},
				vertexShader: `varying vec2 p;uniform float height;
				void main(){p=position.xy;vec3 v=position;v.z=height;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(v,1.);}`,
				fragmentShader: `varying vec2 p;uniform float time;uniform float reveal;
				void main(){float phase=fract(time/10.5);float radius=3.2+phase*9.;
				float distance=abs(length(p)-radius);
				float band=exp(-pow(distance/.22,2.));
				float fine=1.-smoothstep(.01,.025,abs(distance-.1));
				float alpha=(band*.026+fine*.04)*sin(phase*3.14159)*reveal;
				gl_FragColor=vec4(.025,.11,.28,alpha);}`,
				transparent: true,
				depthWrite: false,
				side: DoubleSide,
				blending: AdditiveBlending,
			}),
		);
		wave.name = "ChinaRadialDiffusion";
		wave.renderOrder = 3;
		this.group.add(wave);
		// 地面刻痕：60 个沿圆周排布的小矩形，长短交替（0.4 / 0.2）形成节奏感。
		// 手写 BufferGeometry 并合并成一个 Mesh，60 片面片只需一次 draw call；
		// 若逐片建 Mesh，每帧的光照/排序开销会明显上升。
		const positions: number[] = [],
			uvs: number[] = [],
			indices: number[] = [];
		for (let i = 0; i < 60; i++) {
			const angle = (i * Math.PI * 2) / 60;
			const radialX = Math.cos(angle);
			const radialY = Math.sin(angle);
			const length = i % 2 === 0 ? 0.4 : 0.2;
			// 半径 7.3 已接近地图半宽，刻痕落在画面最外圈，只作为装饰存在
			const radius = 7.3 - length / 2;
			// 四个角按 (u, v) 参数化：u 沿半径方向，v 为横向宽度 0.075
			for (const [u, v] of [
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
			]) {
				const along = (u - 0.5) * length;
				const across = (v - 0.5) * 0.075;
				positions.push(
					radialX * (radius + along) - radialY * across,
					radialY * (radius + along) + radialX * across,
					-0.2,
				);
				uvs.push(u, v);
			}
			const start = i * 4;
			indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
		}
		const glints = new Mesh(
			new BufferGeometry()
				.setAttribute("position", new Float32BufferAttribute(positions, 3))
				.setAttribute("uv", new Float32BufferAttribute(uvs, 2))
				.setIndex(indices),
			new ShaderMaterial({
				uniforms: {
					time: this.time,
					rotationAngle: this.rotationAngle,
					reveal: this.reveal,
					entrance: this.entrance,
				},
				vertexShader: `uniform float time;uniform float entrance;uniform float rotationAngle;
				varying vec2 vUv;varying float opacity;
				void main(){vUv=uv;vec3 p=position;
				float angle=-rotationAngle;float c=cos(angle),s=sin(angle);
				p.xy=vec2(c*p.x-s*p.y,s*p.x+c*p.y)*entrance;
					opacity=.45+.025*sin(time*.8);
				gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
				fragmentShader: `varying vec2 vUv;varying float opacity;uniform float reveal;
				void main(){vec2 d=abs(vUv-.5);
				float mark=(1.-smoothstep(.34,.5,d.x))*(1.-smoothstep(.22,.5,d.y));
				gl_FragColor=vec4(.04,.72,.66,mark*opacity*reveal);
				#include <colorspace_fragment>}`,
				transparent: true,
				depthTest: true,
				depthWrite: false,
				side: DoubleSide,
				blending: AdditiveBlending,
			}),
		);
		glints.name = "ChinaGroundGlints";
		glints.renderOrder = -3;
		// 旋转与缩放在顶点着色器里做，CPU 端包围球不会随之更新，
		// 关掉视锥剔除防止镜头移动时整片刻痕被误判为不可见。
		glints.frustumCulled = false;
		// 纯装饰层，不参与射线拾取，避免挡住地图上的可点击对象
		glints.raycast = () => undefined;
		this.group.add(glints);
		this.setRegion();
	}

	/**
	 * 两层地面参考装饰：
	 * 1）底层波纹——大范围角向断弧 + 两道同心环，压在 z=-0.9 的最下方；
	 * 2）旋转蓝弧——沿 r≈6.1 的细亮弧线，随时间缓慢转动，z=-0.55。
	 * 两层都刻意压低不透明度，作为「底噪」存在，不抢主视觉。
	 */
	private createGroundRipples() {
		const ripples = new Mesh(
			new PlaneGeometry(17, 17),
			new ShaderMaterial({
				uniforms: {
					time: this.time,
					reveal: this.reveal,
					entrance: this.entrance,
				},
				vertexShader: `varying vec2 p;void main(){p=position.xy;
					gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying vec2 p;uniform float time;uniform float reveal;uniform float entrance;
					void main(){float r=length(p)/max(entrance,.0001);float angle=atan(p.y,p.x)/6.2831853;
					float phase=fract(angle*2.-time*.045);
					float arc=smoothstep(.03,.09,phase)*(1.-smoothstep(.64,.73,phase));
					float broadDistance=(r-6.2)/.36;
					float outerDistance=(r-6.85)/.1;
					float broad=exp(-broadDistance*broadDistance)*arc;
					float outer=exp(-outerDistance*outerDistance)*(.35+arc*.65);
					float alpha=(broad*.11+outer*.05)*reveal;
					gl_FragColor=vec4(.006,.02,.064,alpha);
					#include <colorspace_fragment>}`,
				transparent: true,
				depthWrite: false,
				side: DoubleSide,
			}),
		);
		ripples.name = "ReferenceGroundRipples";
		ripples.position.z = -0.9;
		ripples.renderOrder = 2;
		this.group.add(ripples);
		const arcs = new Mesh(
			new PlaneGeometry(15, 15),
			new ShaderMaterial({
				uniforms: {
					time: this.time,
					rotationAngle: this.rotationAngle,
					reveal: this.reveal,
					entrance: this.entrance,
				},
				vertexShader: `varying vec2 p;void main(){p=position.xy;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying vec2 p;uniform float reveal;uniform float entrance;uniform float rotationAngle;
				float rim(float r,float radius,float width){float aa=max(fwidth(r),.001);
				return 1.-smoothstep(width,width+aa,abs(r-radius));}
				void main(){float r=length(p)/max(entrance,.0001);float angle=atan(p.y,p.x)/6.2831853;
				float phase=fract(angle*4.-rotationAngle/6.2831853*4.);
				float arc=smoothstep(.025,.05,phase)*(1.-smoothstep(.413889,.438889,phase));
				float strong=rim(r,6.1,.045)*arc;
				float halo=exp(-abs(r-6.1)*40.)*arc;
				gl_FragColor=vec4(.035,.14,.34,(strong*.22+halo*.012)*reveal);}`,
				transparent: true,
				depthTest: true,
				depthWrite: false,
				side: DoubleSide,
				blending: AdditiveBlending,
			}),
		);
		arcs.name = "ReferenceRotatingBlueArcs";
		arcs.position.z = -0.55;
		arcs.renderOrder = -3;
		this.group.add(arcs);
	}

	/**
	 * 把整套特效移动到指定区域并重新播放入场。
	 * 内部所有尺寸都按「宽度 15 个局部单位」设计，因此用 span/15 作为整体缩放，
	 * 这样换省/换市只需改 span，不用重建任何几何。
	 * @param x 区域中心的地图局部 x
	 * @param y 区域中心的地图局部 y
	 * @param span 区域横向跨度，单位为地图局部坐标
	 * @param _surface 预留的地表高度参数，当前实现未使用，波纹高度固定为 -0.62
	 */
	setRegion(x = 0, y = 0, span = 15, _surface = 0.48) {
		const scale = Math.max(span / 15, 0.00001);
		this.group.position.set(x, y, 0);
		this.group.scale.setScalar(scale);
		this.waveHeight.value = -0.62;
		this.restartEntrance(0.35);
	}

	/**
	 * 从头播放入场动画：清零计时与共享 uniform。
	 * @param delay 延迟秒数，用于多个特效错峰出场
	 */
	restartEntrance(delay = 0) {
		this.age = 0;
		this.entranceDelay = Math.max(0, delay);
		this.exiting = false;
		this.reveal.value = 0;
		this.entrance.value = 0;
		this.rotationAngle.value = 0;
		// 清空上一帧时间戳，使下一次 update 的 delta 为 0，避免切换瞬间动画跳跃
		this.previousSeconds = undefined;
	}

	/**
	 * 开始退场：返回 entrance uniform，交给外部 tween 从当前值缓动到 0。
	 * 同时锁定当前的 reveal/entrance 比例，让透明度随缩放同步衰减，
	 * 即使入场播到一半就被打断，也不会突然整片消失。
	 */
	startExit(): { value: number } {
		this.exiting = true;
		this.exitRevealScale =
			this.entrance.value > 0 ? this.reveal.value / this.entrance.value : 0;
		return this.entrance;
	}

	/** 取消退场：直接跳到完全展开的终态，并把 age 推进到入场结束之后 */
	cancelExit() {
		this.exiting = false;
		this.entrance.value = 1;
		this.reveal.value = 1;
		this.age = this.entranceDelay + ENTRANCE_DURATION;
		this.previousSeconds = undefined;
	}

	/**
	 * 生成发光边界：内侧点阵（canvas 遮罩 + shader）+ 外侧描边管。
	 * @param rings 闭合环列表，每个环是一串地图局部坐标点；通常是省界或市界
	 * @param scale 当前区域缩放，用于让描边宽度与点阵疏密随缩放同步
	 * @param gridBounds 网格原点与跨度 (minX, minY, span)，决定点阵的对齐基准
	 * @returns 一个可直接加入场景的 Group
	 */
	stroke(
		rings: Vector3[][],
		scale: number,
		gridBounds = new Vector3(-7.5, -4, 15),
	) {
		const group = new Group();
		group.name = "ChinaGlowingBoundary";
		// 描边颜色预先乘 1.55 提亮：叠加混合下亮度靠自发光累积，
		// toneMapped=false 防止后处理色调映射把细线压暗到看不见。
		const material = new MeshBasicMaterial({
			color: new Color("#d4f3ff").multiplyScalar(1.55),
			opacity: 0.95,
			transparent: true,
			blending: AdditiveBlending,
			depthWrite: false,
			toneMapped: false,
		});
		const vertices = rings.flat();
		if (vertices.length) {
			const minX = Math.min(...vertices.map((point) => point.x));
			const maxX = Math.max(...vertices.map((point) => point.x));
			const minY = Math.min(...vertices.map((point) => point.y));
			const maxY = Math.max(...vertices.map((point) => point.y));
			const width = Math.max(maxX - minX, 0.00001);
			const height = Math.max(maxY - minY, 0.00001);
			// 以长边 2048 像素生成遮罩：足够细腻，又不至于让画布尺寸随区域面积暴涨
			const resolution = 2048 / Math.max(width, height);
			const canvas = document.createElement("canvas");
			canvas.width = Math.ceil(width * resolution);
			canvas.height = Math.ceil(height * resolution);
			const context = canvas.getContext("2d");
			if (context) {
				const land = new Path2D();
				for (const ring of rings) {
					ring.forEach((point, index) => {
						const x = (point.x - minX) * resolution;
						// canvas 原点在左上、y 轴向下，需按 maxY 翻转才能与地图方向一致
						const y = (maxY - point.y) * resolution;
						if (index === 0) land.moveTo(x, y);
						else land.lineTo(x, y);
					});
					land.closePath();
				}
				// 先裁剪再模糊：否则向内渐隐会溢出到凹形海岸之外，边缘出现脏光晕
				context.clip(land);
				// 这张遮罩只用于控制点阵亮度，不会作为实心发光贴图直接渲染；
				// 两遍不同笔宽的白色描边叠加，模糊后形成由外向内递减的亮度梯度。
				for (const [breadth, opacity] of [
					[0.92, 0.5],
					[0.38, 0.5],
				]) {
					// 笔宽按「世界单位 × resolution」换算为像素，2px 下限防止小区域糊成一团
					const fadeWidth = Math.max(2, breadth * scale * resolution);
					context.filter = `blur(${fadeWidth * 0.55}px)`;
					context.lineWidth = fadeWidth * 0.8;
					context.strokeStyle = "#ffffff";
					context.globalAlpha = opacity;
					context.stroke(land);
				}
				const texture = new CanvasTexture(canvas);
				texture.colorSpace = SRGBColorSpace;
				// 边界遮罩随区域重建，登记到独立集合；不能放进 textures 贴图池，
				// 否则切换区域时会误释放被新区域复用的静态贴图。
				this.boundaryTextures.add(texture);
				const dots = new Mesh(
					new PlaneGeometry(width, height),
					new ShaderMaterial({
						// uniform 含义：boundaryMask 为上面的遮罩贴图；
						// gridBounds 的 xy 是网格原点、z 是跨度，用于对齐点阵；
						// planeCenter 是面片中心的世界坐标，因为 position.xy 以面片自身为中心。
						uniforms: {
							boundaryMask: { value: texture },
							gridBounds: { value: gridBounds.clone() },
							planeCenter: {
								value: new Vector2((minX + maxX) / 2, (minY + maxY) / 2),
							},
						},
						vertexShader: `
							varying vec2 vUv;
							varying vec2 vMap;
							uniform vec2 planeCenter;
							void main() {
								vUv = uv;
								vMap = position.xy + planeCenter;
								gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
							}
						`,
						fragmentShader: `
							varying vec2 vUv;
							varying vec2 vMap;
							uniform sampler2D boundaryMask;
							uniform vec3 gridBounds;
							void main() {
								float spacing = .078 * max(gridBounds.z / 15., .00001);
								vec2 grid = (vMap - gridBounds.xy) / spacing;
								vec2 footprint = fwidth(grid);
								vec2 cell = abs(fract(grid) - .5);
								vec2 aa = max(footprint * .5, vec2(.025));
								vec2 square = 1. - smoothstep(vec2(.17) - aa, vec2(.17) + aa, cell);
								// Average subpixel dots at a distance; reveal their shape continuously on zoom.
								float detail = 1. - smoothstep(.16, .38, max(footprint.x, footprint.y));
								float coverage = mix(.1156, square.x * square.y, detail);
								float inward = pow(clamp(texture2D(boundaryMask, vUv).a * 2., 0., 1.), 1.15);
								float alpha = coverage * inward * .88;
								gl_FragColor = vec4(.25, .75, 1.3, alpha);
								#include <colorspace_fragment>
							}
						`,
						transparent: true,
						blending: AdditiveBlending,
						depthWrite: false,
						toneMapped: false,
					}),
				);
				dots.position.set((minX + maxX) / 2, (minY + maxY) / 2, vertices[0].z);
				dots.name = "ChinaBoundaryInwardDots";
				// 8 号渲染顺序：压在边界描边与地面装饰（2/3）之上、飞线与光柱（12/13）之下
				dots.renderOrder = 8;
				group.add(dots);
			}
		}
		// 外侧描边：把环上相邻点用直线段串成 CurvePath 再生成 Tube。
		// 不做平滑（不用 CatmullRom），以保留行政边界的真实折角。
		for (const ring of rings) {
			// 少于 7 个点的环多为零碎小岛或退化多边形，管道会自交，直接跳过
			if (ring.length < 7) continue;
			const curve = new CurvePath<Vector3>();
			for (let i = 0; i < ring.length; i++) {
				const next = ring[(i + 1) % ring.length];
				if (!ring[i].equals(next)) curve.add(new LineCurve3(ring[i], next));
			}
			if (!curve.curves.length) continue;
			const mesh = new Mesh(
				new TubeGeometry(
					curve,
					// 段数夹在 180~900：太少折角变钝，太多纯属浪费顶点
					Math.min(900, Math.max(180, ring.length)),
					0.015 * scale,
					6,
					true,
				),
				material,
			);
			mesh.renderOrder = 8;
			group.add(mesh);
		}
		return group;
	}

	/**
	 * 一条带流动光带的飞线，并在终点带一个聚焦标记。
	 * @param curve 已转换到地图局部坐标的二次贝塞尔曲线（通常抬离地面形成拱形）
	 * @param scale 缩放系数，同时作用于管径与终点标记大小
	 * @param index 序号，决定配色（每 3 条出现一条粉色）与光带相位偏移
	 */
	flyline(curve: import("three").QuadraticBezierCurve3, scale = 1, index = 0) {
		const group = new Group();
		// 粉色用于打散单一色相，index%3 的循环让相邻飞线颜色不同
		const color = index % 3 === 1 ? "#ff98d6" : "#80eaff";
		const mesh = new Mesh(
			// 100 段足够表现贝塞尔弧度；管径随 scale 变化，缩放后仍保持视觉粗细
			new TubeGeometry(curve, 100, 0.022 * scale, 6, false),
			new ShaderMaterial({
				uniforms: {
					time: this.time,
					color: { value: new Color(color) },
					offset: { value: index * 0.19 },
				},
				vertexShader: `varying vec2 vUv;void main(){vUv=uv;
					gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying vec2 vUv;uniform float time;uniform float offset;uniform vec3 color;
					void main(){float head=fract(time*.23+offset);
					float behind=fract(head-vUv.x);float tail=pow(max(0.,1.-behind/.32),1.8);
					float core=exp(-pow(behind/.018,2.));
					float endFade=smoothstep(0.,.025,vUv.x)*(1.-smoothstep(.975,1.,vUv.x));
					gl_FragColor=vec4(mix(color,vec3(1.),core*.9)*(1.+tail*.8),(.24+tail*.76)*endFade);
					#include <colorspace_fragment>}`,
				// 光带位置：head = fract(time * 0.23 + offset)，即每秒前进 23% 弧长，
				// 约 4.3 秒一轮；offset 让多条飞线错开。behind 为当前像素落后光头的距离，
				// 高斯 core 画亮芯、幂函数 tail 画拖尾，两端 endFade 消除截面硬边。
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		mesh.name = "ChinaFlowingFlyline";
		// 12 号渲染顺序：飞线要压在边界点阵（8）之上
		mesh.renderOrder = 12;
		// 终点标记缩到 0.4 倍，避免在端点处盖住飞线本身；beam=true 保留光柱
		group.add(mesh, this.focus(curve.v2, scale * 0.4, true, color));
		return group;
	}

	/**
	 * 体积光柱：三层同心面片叠出「外柔光 / 主体 / 高亮芯」，再复制一份转 90°，
	 * 两片十字交叉后，从任意水平方位看过去都至少有一片接近正面，柱体不会消失。
	 * @param height 柱高（局部坐标单位）
	 * @param width 主体宽度，向外层柔和光晕按 2.4 倍、内层亮芯按 0.2 倍缩放
	 */
	private lightBeam(height: number, width: number, color: string) {
		const group = new Group();
		for (const [key, breadth, tint, opacity] of [
			["glow", width * 2.4, color, 0.38],
			["focusBar", width, color, 0.76],
			["focusBar", width * 0.2, "#f5ffff", 0.94],
		] as const) {
			const geometry = new PlaneGeometry(breadth, height);
			// 先下移半个柱高，使旋转后柱底正好落在锚点、柱身沿 +Z 向屏幕外立起
			geometry.translate(0, height / 2, 0);
			const material = new MeshBasicMaterial({
				map: this.texture(key),
				color: tint,
				opacity,
				transparent: true,
				side: DoubleSide,
				depthWrite: false,
				blending: AdditiveBlending,
			});
			const beam = new Mesh(geometry, material);
			// 13 号渲染顺序让白色亮芯压在彩色光晕之上，否则叠加混合下会被盖住
			beam.renderOrder = tint === "#f5ffff" ? 13 : 12;
			beam.rotation.x = Math.PI / 2;
			const partner = beam.clone();
			partner.rotation.y = Math.PI / 2;
			group.add(beam, partner);
		}
		return group;
	}

	/**
	 * 重点标记组合：静态底光 + 旋转环 + 反向旋转箭头 + 白色亮核 + 扩散脉冲，
	 * 可选再叠一根光柱，用于飞线终点、产业园区等需要强调的位置。
	 * @param position 标记中心的地图局部坐标
	 * @param scale 整体缩放（飞线终点传 0.4 让标记更含蓄）
	 * @param beam 是否叠加光柱
	 * @param color 主题色，同时用于底光、箭头与光柱
	 */
	focus(position: Vector3, scale = 1, beam = true, color = "#b8dcff") {
		const group = new Group();
		group.position.copy(position);
		group.scale.setScalar(scale);
		// 三层转速不同：底光静止做基底，圆环 0.28、箭头 -0.18 反向转，形成层次；
		// 尺寸 1.7 / 1.55 / 1.85，箭头最大，正好露在圆环外缘。
		for (const [key, speed, opacity, size] of [
			["focusBg", 0, 0.48, 1.7],
			["focusRing", 0.28, 0.88, 1.55],
			["focusArrows", -0.18, 0.8, 1.85],
		] as const) {
			const plane = this.plane(key, size, opacity, color);
			// 统一抬离底图平面 0.008，避免与地图或其他面片共面导致半透明闪烁
			plane.position.z = 0.008;
			plane.renderOrder = 12;
			group.add(plane);
			// speed 为 0 的底光保持静止，只有自转的面片才登记到全局列表
			if (speed) this.rotations.push({ mesh: plane, speed });
		}
		const core = this.plane("scatter", 0.9, 0.9, "#ffffff");
		core.position.z = 0.012;
		core.renderOrder = 13;
		group.add(core);
		const pulse = this.plane("focusPulse", 1.7, 0.5, color);
		pulse.renderOrder = 12;
		group.add(pulse);
		// offset 按已登记数量递增 0.18，让多个脉冲环依次扩散而不是同步闪烁
		this.pulses.push({ mesh: pulse, offset: this.pulses.length * 0.18 });
		if (beam) {
			// 光柱固定 3.4 高、0.22 宽，在 focus 的缩放下随标记整体缩放
			group.add(this.lightBeam(3.4, 0.22, color));
		}
		return group;
	}

	/**
	 * 立体散点：一根细柱从地面升起，柱顶叠一层柔光斑与白色亮核，
	 * 用来表现「有高度」的指标（例如产业规模、监测强度）。
	 * @param position 柱底的地图局部坐标
	 * @param size 散点尺寸，柱高取 size * 0.72，光斑半径取 2.2 倍
	 */
	scatter(position: Vector3, size: number) {
		const group = new Group();
		group.name = "ChinaDimensionalScatter";
		group.position.copy(position);
		const height = size * 0.72;
		// 光斑与亮核用 Sprite：柱顶光点在任何相机角度下都应保持圆形
		const glow = new Sprite(
			new SpriteMaterial({
				map: this.texture("scatter"),
				color: "#97ffdf",
				opacity: 0.72,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		glow.position.z = height;
		glow.scale.setScalar(size * 2.2);
		glow.renderOrder = 12;
		const core = new Sprite(
			new SpriteMaterial({
				map: this.texture("scatterCore"),
				color: "#f3fffb",
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		core.position.z = height;
		core.scale.setScalar(size * 1.2);
		core.renderOrder = 13;
		const stem = new Mesh(
			// 柱体用细长立方体而非圆柱：远处看不出差别，却能省下大量顶点
			new BoxGeometry(size * 0.11, size * 0.11, height),
			new MeshBasicMaterial({
				color: "#9af9da",
				opacity: 0.48,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		// 几何以自身中心为原点，上移半个柱高才能让柱底贴合地面
		stem.position.z = height / 2;
		stem.renderOrder = 12;
		group.add(stem, glow, core);
		return group;
	}

	/**
	 * 监测点：一个小号 focus 光圈（不带光柱）+ 悬浮的菱形图标。
	 * 图标单独返回，是因为调用方要把它挂到单独的层级里做置顶与拾取，
	 * 不能和光圈一起被父级缩放或遮挡。
	 * @param position 监测点在地图局部坐标中的位置
	 * @param index 序号，仅用于生成调试名「监测点-N」
	 * @param scale 父级缩放，光圈取 0.3 倍、图标取 0.48 倍，避免盖住地图
	 */
	info(position: Vector3, index: number, scale = 1) {
		const group = this.focus(position, scale * 0.3, false);
		const marker = new Sprite(
			new SpriteMaterial({
				map: this.texture("point"),
				color: "#ffffff",
				transparent: true,
				depthWrite: false,
			}),
		);
		marker.position.copy(position).add(new Vector3(0, 0, 0.19 * scale));
		marker.scale.setScalar(0.48 * scale);
		marker.renderOrder = 15;
		// 关闭深度测试：图标永不被他物遮挡，保证最后一层仍可点击/可读
		marker.material.depthTest = false;
		marker.userData.name = `监测点-${index + 1}`;
		return { group, marker };
	}

	/**
	 * 判断对象及其所有祖先是否可见，直到遇到 Scene 为止。
	 * 用于在整块特效被隐藏时跳过旋转/脉冲的逐帧计算，省下无意义的 CPU 开销。
	 */
	private visible(object: Object3D) {
		let current: Object3D | null = object;
		while (current) {
			if (!current.visible) return false;
			if (current.type === "Scene") return true;
			current = current.parent;
		}
		return false;
	}

	/**
	 * 逐帧驱动所有动画。
	 * @param seconds 主循环提供的累计时间（秒）
	 * @param reducedMotion 无障碍偏好：为 true 时冻结时间与旋转，直接呈现终态
	 */
	update(seconds: number, reducedMotion: boolean) {
		if (!this.loaded || this.disposed) return;
		// delta 上限 0.1 秒：标签页切回时时间戳会跳跃数秒，
		// 不钳制的话所有动画会瞬间前进一大步；整块特效不可见时 delta 直接归零。
		const delta = this.visible(this.group)
			? Math.min(0.1, Math.max(0, seconds - (this.previousSeconds ?? seconds)))
			: 0;
		this.previousSeconds = seconds;
		if (!reducedMotion) this.time.value += delta;
		// 用「扣除延迟后的入场年龄」求差，才能正确计算被延迟段的旋转增量
		const previousEntranceAge = Math.max(0, this.age - this.entranceDelay);
		this.age += delta;
		const entranceAge = Math.max(0, this.age - this.entranceDelay);
		if (!reducedMotion) {
			// 退场时不等入场延迟，旋转直接按真实 delta 前进，避免淡出时光圈突然静止
			const rotationDelta = this.exiting
				? delta
				: entranceAge - previousEntranceAge;
			this.rotationAngle.value += rotationDelta * this.rotationSpeed.value;
		}
		if (this.exiting) {
			// 退场：透明度只跟随外部 tween 驱动的 entrance，并按锁定比例同步收缩
			this.reveal.value = Math.max(
				0,
				this.entrance.value * this.exitRevealScale,
			);
		} else {
			// 入场：透明度 1.3 秒线性淡入，缩放用 4.8 秒二次缓出（1-(1-p)^2）
			this.reveal.value = reducedMotion ? 1 : Math.min(1, entranceAge / 1.3);
			const entranceProgress = Math.min(1, entranceAge / ENTRANCE_DURATION);
			this.entrance.value = reducedMotion ? 1 : 1 - (1 - entranceProgress) ** 2;
		}
		// offset.x 随时间线性递减，让纹理图案沿 UV 正方向滚动；0.36 为每秒偏移量
		this.texture("flyline").offset.x = -this.time.value * 0.36;
		for (const { mesh, speed } of this.rotations) {
			if (!this.visible(mesh)) continue;
			mesh.rotation.z = this.time.value * speed;
			// 只有直接挂在根节点上的环才参与入场缩放；嵌套在站点组里的
			// 会随父级一起缩放，再乘一次会缩过头。
			if (mesh.parent === this.group)
				mesh.scale.setScalar(
					Math.sin((Math.min(1, entranceAge / 1.3) * Math.PI) / 2),
				);
		}
		for (const { mesh, offset } of this.pulses) {
			if (!this.visible(mesh)) continue;
			// 3.3 秒一轮扩散：phase 从 0 到 1，半径放大到 1.5 倍、透明度反向衰减
			const phase = (this.time.value / 3.3 + offset) % 1;
			mesh.scale.setScalar(phase * 1.5);
			mesh.material.opacity = (1 - phase) * 0.5;
		}
	}

	/**
	 * 某个子树的资源被移除后调用：清理动画列表中的悬空引用，并释放该子树专用的遮罩贴图。
	 * 共享贴图（textures 池）不在此处理，否则会误删其他对象仍在使用的纹理。
	 */
	forget(root: Object3D) {
		const removed = new Set<Object3D>();
		root.traverse((object) => {
			removed.add(object);
			if (!(object instanceof Mesh)) return;
			const materials = Array.isArray(object.material)
				? object.material
				: [object.material];
			for (const material of materials) {
				if (material instanceof ShaderMaterial) {
					// 边界点阵的遮罩由 stroke() 生成，专属于这一层，需要真正释放
					const mask = material.uniforms.boundaryMask?.value as
						| Texture
						| undefined;
					if (mask && this.boundaryTextures.delete(mask)) mask.dispose();
				}
				// MeshBasicMaterial.map 指向共享贴图池，只能从集合里移除登记，不能 dispose
				if (material instanceof MeshBasicMaterial && material.map)
					this.boundaryTextures.delete(material.map);
			}
		});
		// 倒序遍历删除，避免 splice 后索引前移导致漏删
		for (const list of [this.rotations, this.pulses]) {
			for (let i = list.length - 1; i >= 0; i--)
				if (removed.has(list[i].mesh)) list.splice(i, 1);
		}
	}

	/** 释放全部贴图与列表引用；只应在特效层彻底不再使用时调用 */
	dispose() {
		this.disposed = true;
		for (const texture of this.textures.values()) texture.dispose();
		for (const texture of this.boundaryTextures) texture.dispose();
		this.boundaryTextures.clear();
		this.textures.clear();
		this.rotations.length = this.pulses.length = 0;
	}
}

/**
 * 全球视图场景：构建地球球体（等距圆柱贴图 + 自定义光照 shader）、漂流云层、经纬网、
 * 国界与省界描边、扫描球壳、环绕光带、北京枢纽与 16 个航线终点、货运飞线以及背景星空。
 * 由 WorldState 实例化，create() 完成后交给 world 控制器逐帧更新与显隐控制；
 * 依赖 SceneTextures 生成贴图、geometry.polygonsOf 解析 GeoJSON、constants 提供尺寸与姿态。
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
	AdditiveBlending,
	BufferGeometry,
	Color,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineLoop,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Points,
	PointsMaterial,
	ShaderMaterial,
	SphereGeometry,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	TextureLoader,
	TorusGeometry,
	Vector3,
	type WebGLRenderer,
} from "three";
import GlobeFreight from "../freight";
import { GLOBE_HOME, GLOBE_ORBIT_RADIUS, GLOBE_SCAN_RADIUS } from "./constants";
import { polygonsOf } from "./geometry";
import type SceneTextures from "./textures";
import type { Layer, MapFeature } from "./types";

/**
 * 全球视图的场景构建器。
 * 对外只暴露 root / effects 与各业务图层容器，球体与装饰对象在 create() 中按需创建，
 * 因此任何字段都可能在纹理加载完成前为 undefined，调用方需自行判空。
 */
export default class GlobeScene {
	/** 场景根节点，挂到 scene 上；光晕等不随球体自转的内容直接放这里 */
	readonly root = new Group();
	/** 背景装饰容器（星空与远景轨道环），与世界坐标对齐，不参与球体旋转 */
	readonly effects = new Group();
	/** 业务图层容器：key 与图层开关一一对应，便于整体控制显隐与透明度 */
	readonly layers: Record<Layer, Group> = {
		flyline: new Group(),
		label: new Group(),
		point: new Group(),
		scatter: new Group(),
		heat: new Group(),
		region: new Group(),
		scan: new Group(),
	};
	/** 地球球体，初始材质为 canvas 生成的占位贴图，纹理加载完成后整体替换 */
	mesh: Mesh | undefined;
	/** 云层球壳，半径略大于地表，叠在球体内部随之自转 */
	clouds: Mesh<SphereGeometry, ShaderMaterial> | undefined;
	/** 扫描球壳，使用独立 shader 画自上而下的扫描带 */
	scan: Mesh<SphereGeometry, ShaderMaterial> | undefined;
	/** 环绕光带，平面几何体配合噪声 shader 模拟流动的云环 */
	floatingRing: Mesh<PlaneGeometry, ShaderMaterial> | undefined;
	/** 大气光晕 Sprite，尺寸跟随扫描球壳以保证扩散到轮廓处刚好消失 */
	radiance: Sprite | undefined;
	/** 货运飞线（铁路/海运/空运航线），挂到 flyline 图层 */
	freight: GlobeFreight | undefined;
	/** 北京枢纽的扩散圆环，由逐帧动画推进缩放与透明度 */
	readonly pulseRings: Mesh[] = [];

	/**
	 * @param textures 贴图工厂，负责 canvas 贴图、Sprite 与可释放资源登记
	 * @param reducedMotion 系统「减少动态效果」媒体查询，命中时关闭扫描等循环动画
	 */
	constructor(
		private readonly textures: SceneTextures,
		private readonly reducedMotion: MediaQueryList,
	) {}

	/**
	 * 一次性构建整个全球视图（球体、图层、航线端点与背景）。
	 * @param countries 世界国界数据，用于绘制地表填充与海岸线
	 * @param china 中国省级面数据，用于高亮中国及其省界
	 * @param outline 中国国界数据，用于叠加更亮的国界光带
	 * @param renderer 用于查询设备支持的各向异性上限，控制贴图清晰度
	 * @param isDestroyed 异步加载期间的回调，若返回 true 则放弃后续建对象，避免写入已释放的场景
	 */
	async create(
		countries: FeatureCollection<Polygon | MultiPolygon>,
		china: FeatureCollection<Polygon | MultiPolygon>,
		outline: FeatureCollection<Polygon | MultiPolygon>,
		renderer: WebGLRenderer,
		isDestroyed: () => boolean,
	) {
		// 先用 canvas 画一张等距圆柱投影的占位底图，保证纹理到位前地球不是纯黑球
		const texture = this.textures.canvas(2048, 1024, (context) => {
			context.fillStyle = "#041328";
			context.fillRect(0, 0, 2048, 1024);
			// 经纬度 → 贴图像素：经度线性铺满 0~2048，纬度按 90°→0 映射到 0~1024
			const drawFeature = (
				feature: MapFeature,
				fill: string,
				stroke: string,
			) => {
				context.fillStyle = fill;
				context.strokeStyle = stroke;
				context.lineWidth = 1.4;
				for (const polygon of polygonsOf(feature)) {
					context.beginPath();
					polygon.forEach((ring) => {
						ring.forEach((coordinate, index) => {
							const x = ((coordinate[0] + 180) / 360) * 2048;
							const y = ((90 - coordinate[1]) / 180) * 1024;
							if (index === 0) context.moveTo(x, y);
							else context.lineTo(x, y);
						});
					});
					context.closePath();
					// evenodd 让内环（湖泊等孔洞）按奇偶规则被挖空，而不是被填实
					context.fill("evenodd");
					context.stroke();
				}
			};
			countries.features.forEach((feature) => {
				drawFeature(feature, "#16446d", "#3682ac");
			});
			// 只给带 name 的要素上高亮色，无名称的多为争议岛屿碎片，保持底色即可
			china.features
				.filter((feature) => feature.properties?.name)
				.forEach((feature) => {
					drawFeature(feature, "#3587b7", "#b8eeff");
				});
			context.strokeStyle = "rgba(29,86,124,.32)";
			context.lineWidth = 0.7;
			// 24 条经线 + 12 条纬线，正好等分 360° / 180°，形成 15° 一格的经纬网
			for (let longitude = 0; longitude <= 2048; longitude += 2048 / 24) {
				context.beginPath();
				context.moveTo(longitude, 0);
				context.lineTo(longitude, 1024);
				context.stroke();
			}
			for (let latitude = 0; latitude <= 1024; latitude += 1024 / 12) {
				context.beginPath();
				context.moveTo(0, latitude);
				context.lineTo(2048, latitude);
				context.stroke();
			}
		});
		// 半径 5.1 为地球的世界坐标半径，160×96 分段让贴图接缝与描边足够平滑
		this.mesh = new Mesh(
			new SphereGeometry(5.1, 160, 96),
			new MeshBasicMaterial({ map: texture }),
		);
		// 初始姿态把中国一侧转到镜头前，x 分量拉出约 36° 的俯视角
		this.mesh.rotation.y = Math.PI * 0.94 + 0.6;
		this.mesh.rotation.x = Math.PI * 0.2;
		this.root.add(this.mesh);
		// scan 图层挂 root（扫描球壳不跟随地表旋转），其余图层跟随球体，随拖拽与自转一起动
		Object.entries(this.layers).forEach(([id, layer]) => {
			if (id === "scan") this.root.add(layer);
			else this.mesh?.add(layer);
		});
		const loader = new TextureLoader();
		// 三张贴图并发加载；allSettled 保证单张失败不会让整个 await 直接 reject，便于统一清理
		const textureResults = await Promise.allSettled([
			loader.loadAsync("/assets/images/blue/earth-day-8k.jpg"),
			loader.loadAsync("/assets/images/blue/earth-specular.jpg"),
			loader.loadAsync("/assets/images/blue/earth-clouds-8k.jpg"),
		]);
		const textures = textureResults.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
		const failure = textureResults.find(
			(result) => result.status === "rejected",
		);
		// 竞态兜底：加载期间组件被卸载时，已完成的贴图必须就地释放，否则显存泄漏
		if (failure || isDestroyed()) {
			textures.forEach((item) => {
				item.dispose();
			});
			if (failure) throw failure.reason;
			return;
		}
		const [surface, specular, clouds] = textures;
		// 各向异性上限压到 8：斜视地表时更清晰，同时避免低端 GPU 采样开销过大
		textures.forEach((item) => {
			item.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
			this.textures.disposable.add(item);
		});
		// 颜色贴图必须声明 sRGB，否则渲染结果会整体偏暗、偏灰
		surface.colorSpace = SRGBColorSpace;
		// 占位材质只为撑过加载期，替换前主动 dispose，避免几何体引用旧材质泄漏
		const old = this.mesh.material;
		(Array.isArray(old) ? old : [old]).forEach((material) => {
			material.dispose();
		});
		const material = new MeshBasicMaterial({ map: surface, color: "#e5f5ff" });
		// 用 onBeforeCompile 往内置材质里注入光照：先带出世界空间法线与视线方向，
		// 再由 Fragment 里按固定太阳方向做平滑明暗、海陆分色与菲涅尔边缘光
		material.onBeforeCompile = (shader) => {
			shader.vertexShader = shader.vertexShader
				.replace(
					"#include <common>",
					"#include <common>\nvarying vec3 vGlobeNormal;varying vec3 vGlobeView;",
				)
				.replace(
					"#include <begin_vertex>",
					"#include <begin_vertex>\nvGlobeNormal=normalize(mat3(modelMatrix)*normal);vGlobeView=cameraPosition-(modelMatrix*vec4(position,1.)).xyz;",
				);
			shader.uniforms.globeSpecular = { value: specular };
			shader.fragmentShader = shader.fragmentShader
				.replace(
					"#include <common>",
					"#include <common>\nvarying vec3 vGlobeNormal;varying vec3 vGlobeView;uniform sampler2D globeSpecular;",
				)
				.replace(
					"#include <map_fragment>",
					`#include <map_fragment>
				float sunlight=smoothstep(-.18,.68,dot(normalize(vGlobeNormal),normalize(vec3(.72,.62,.45))));
				float ocean=texture2D(globeSpecular,vMapUv).r;
				float detail=smoothstep(.06,.62,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
				vec3 land=mix(vec3(.028,.11,.20),vec3(.86,.91,.95),pow(detail,.82));
				vec3 water=mix(vec3(.002,.016,.060),vec3(.018,.18,.34),detail);
				diffuseColor.rgb=mix(land,water,smoothstep(.25,.75,ocean))*(.055+sunlight*1.12);
				diffuseColor.rgb+=texture2D(globeSpecular,vMapUv).r*pow(sunlight,6.)*vec3(.025,.08,.14);
				float horizon=pow(1.-max(dot(normalize(vGlobeNormal),normalize(vGlobeView)),0.),5.);
				diffuseColor.rgb+=vec3(.03,.27,.55)*horizon*(.25+sunlight*.75);`,
				);
		};
		// specular 贴图的红通道近似「海洋掩码」（海面为 1、陆地接近 0），
		// 用它把 diffuse 分成海水与陆地两套色阶，再叠加高光与时隐时现的大气边缘
		this.mesh.material = material;
		// 云层半径 5.145 略高于地表 5.1，避免两层球面共面导致的深度闪烁
		this.clouds = new Mesh(
			new SphereGeometry(5.145, 160, 96),
			new ShaderMaterial({
				uniforms: { cloudMap: { value: clouds }, time: { value: 0 } },
				vertexShader: `varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
				void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);
				vView=cameraPosition-(modelMatrix*vec4(position,1.)).xyz;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `uniform sampler2D cloudMap;uniform float time;
				varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
				void main(){vec2 uv=vUv+vec2(time*.00012,sin(time*.025)*.0005);
				float density=smoothstep(.12,.82,texture2D(cloudMap,uv).r);
				float sunlight=smoothstep(-.22,.70,dot(normalize(vNormal),normalize(vec3(.72,.62,.45))));
				float edge=smoothstep(.01,.15,dot(normalize(vNormal),normalize(vView)));
				gl_FragColor=vec4(vec3(.77,.89,1.)*(.12+sunlight*.9),density*.43*edge);}`,
				transparent: true,
				depthWrite: false,
			}),
		);
		this.clouds.name = "globe-drifting-clouds";
		// 挂到球体内部，让云层随地球一起自转；name 便于调试时在场景树里定位
		this.mesh.add(this.clouds);
		this.createGlobeScan();
		this.createGlobeFloatingRing();
		// 经纬度 → 世界坐标：对经度加 180° 偏移后作为绕 y 轴的极角，使 0° 经线朝向 +x 方向，
		// 纬度 φ 决定高度分量，水平投影半径收缩为 R·cosφ，因此
		// x = -R·cosλ·cosφ、z = R·sinλ·cosφ、y = R·sinφ；radius 即球面半径（世界单位）。
		// 默认 5.165 略高于云层球壳，描边线条才不会沉进地表或云里被遮掉
		const spherical = (coordinates: [number, number], radius = 5.165) => {
			const longitude = ((coordinates[0] + 180) * Math.PI) / 180;
			const latitude = (coordinates[1] * Math.PI) / 180;
			return new Vector3(
				-radius * Math.cos(longitude) * Math.cos(latitude),
				radius * Math.sin(latitude),
				radius * Math.sin(longitude) * Math.cos(latitude),
			);
		};
		// 省界走加法混合、海岸线为普通混合，两者都不写深度，线条叠加在地表上而不会被球体深度剔除
		const provinceOutlineMaterial = new LineBasicMaterial({
			color: "#8ccce6",
			transparent: true,
			opacity: 0.48,
			blending: AdditiveBlending,
			depthWrite: false,
		});
		const coastMaterial = new LineBasicMaterial({
			color: "#77b7ce",
			transparent: true,
			opacity: 0.45,
			depthWrite: false,
		});
		const coastPositions: number[] = [];
		const gridPositions: number[] = [];
		const provincePositions: number[] = [];
		// 把闭合环展开成「成对端点」的扁平数组，整片线框只用一次 LineSegments 绘制，
		// 相比每环一个 LineLoop 能显著减少 draw call；closed 为 false 时丢掉首尾闭合段
		const appendSegments = (
			points: Vector3[],
			positions: number[],
			closed = true,
		) => {
			for (let index = 0; index < points.length - (closed ? 0 : 1); index++) {
				const start = points[index],
					end = points[(index + 1) % points.length];
				positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
			}
		};
		// positions 已是 xyz 顺序的连续数值，每 3 个分量构成一个顶点
		const addSegments = (
			positions: number[],
			material: LineBasicMaterial,
			group: Group,
		) => {
			group.add(
				new LineSegments(
					new BufferGeometry().setAttribute(
						"position",
						new Float32BufferAttribute(positions, 3),
					),
					material,
				),
			);
		};
		// 海岸线只取每个多边形的外环，少于 8 个点的碎环多为小岛噪点，直接丢弃
		countries.features.forEach((feature) => {
			polygonsOf(feature).forEach((polygon) => {
				const ring = polygon[0];
				if (!ring || ring.length < 8) return;
				const points = ring.map((coordinates) =>
					spherical([coordinates[0], coordinates[1]], 5.151),
				);
				appendSegments(points, coastPositions);
			});
		});
		addSegments(coastPositions, coastMaterial, this.layers.heat);
		// 各层半径刻意错开几个千分位来排定先后：网格 5.148 < 海岸线 5.151 < 省界 5.165 < 国界 5.174
		const gridMaterial = new LineBasicMaterial({
			color: "#468ead",
			transparent: true,
			opacity: 0.1,
			depthWrite: false,
		});
		// 经线每 15° 一条；纬度只取 -89~89，避开极点处所有经线收敛成一点的奇异区
		for (let longitude = -180; longitude < 180; longitude += 15) {
			const points: Vector3[] = [];
			for (let latitude = -89; latitude <= 89; latitude += 1)
				points.push(spherical([longitude, latitude], 5.148));
			appendSegments(points, gridPositions, false);
		}
		// 纬线只画到 ±75°，极区附近经线间距趋于 0，画出来会糊成一团
		for (let latitude = -75; latitude <= 75; latitude += 15) {
			const points: Vector3[] = [];
			for (let longitude = -180; longitude <= 180; longitude += 1.5)
				points.push(spherical([longitude, latitude], 5.148));
			appendSegments(points, gridPositions);
		}
		addSegments(gridPositions, gridMaterial, this.layers.region);
		// 国界用 LineLoop 逐环绘制：环数不多，但需要发光描边，因此单独建材质并乘 1.3 提亮配合 bloom
		outline.features.forEach((feature) => {
			polygonsOf(feature).forEach((polygon) => {
				const points = polygon[0].map((coordinate) =>
					spherical([coordinate[0], coordinate[1]], 5.174),
				);
				this.mesh?.add(
					new LineLoop(
						new BufferGeometry().setFromPoints(points),
						new LineBasicMaterial({
							color: new Color("#b7f2ff").multiplyScalar(1.3),
							transparent: true,
							opacity: 0.8,
							blending: AdditiveBlending,
							depthWrite: false,
						}),
					),
				);
			});
		});
		// 省级界只处理带 name 的要素，与底图上的中国高亮保持同一套筛选规则
		china.features.forEach((feature) => {
			if (!feature.properties?.name) return;
			polygonsOf(feature).forEach((polygon) => {
				const ring = polygon[0];
				if (!ring?.length) return;
				const points = ring.map((coordinate) =>
					spherical([coordinate[0], coordinate[1]]),
				);
				appendSegments(points, provincePositions);
			});
		});
		addSegments(provincePositions, provinceOutlineMaterial, this.layers.region);
		// 16 个国际枢纽，坐标为 [经度, 纬度]，全部是北京出发航线的落点
		const destinations: { name: string; coordinates: [number, number] }[] = [
			{ name: "东京", coordinates: [139.7, 35.7] },
			{ name: "首尔", coordinates: [127, 37.5] },
			{ name: "乌兰巴托", coordinates: [106.9, 47.9] },
			{ name: "莫斯科", coordinates: [37.6, 55.8] },
			{ name: "巴黎", coordinates: [2.35, 48.85] },
			{ name: "阿布扎比", coordinates: [54.4, 24.5] },
			{ name: "开罗", coordinates: [31.2, 30] },
			{ name: "孟买", coordinates: [72.8, 19.1] },
			{ name: "新德里", coordinates: [77.2, 28.6] },
			{ name: "曼谷", coordinates: [100.5, 13.7] },
			{ name: "新加坡", coordinates: [103.8, 1.3] },
			{ name: "内比都", coordinates: [96.1, 19.7] },
			{ name: "马尼拉", coordinates: [121, 14.6] },
			{ name: "珀斯", coordinates: [115.9, -31.9] },
			{ name: "堪培拉", coordinates: [149.1, -35.3] },
			{ name: "雅加达", coordinates: [106.8, -6.2] },
		];
		const origin = spherical([116.4, 39.9]);
		// 光晕沿法向再外推 1%，避免与球面共面产生深度闪烁
		const originGlow = new Sprite(
			new SpriteMaterial({
				map: this.textures.glow("#bafff4"),
				transparent: true,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		originGlow.scale.setScalar(0.7);
		originGlow.position.copy(origin.clone().multiplyScalar(1.01));
		this.layers.scatter.add(originGlow);
		// 北京铭牌保留 depthTest：球体转到背面时它会被地球遮住，不会浮在球外造成穿帮
		const originLabel = this.textures.sprite("北京", {
			plate: true,
			simplePlate: true,
			size: 30,
			width: 112,
			height: 64,
		});
		originLabel.material.depthTest = true;
		// 缩放按贴图 112×64 的宽高比设定，保证文字不被拉扁
		originLabel.scale.set(0.62, 0.32, 1);
		originLabel.position
			.copy(origin.clone().multiplyScalar(1.04))
			.add(new Vector3(0.18, 0.1, 0));
		this.layers.scatter.add(originLabel);
		// 三圈脉冲环半径从 0.1 递增到 0.26；Torus 默认躺在 xy 平面、法线朝 +z，
		// 用 setFromUnitVectors 把 +z 旋到球面法向，圆环才能贴住地表而不穿进球体
		for (const radius of [0.1, 0.18, 0.26]) {
			const circle = new Mesh(
				new TorusGeometry(radius, 0.006, 8, 64),
				new MeshBasicMaterial({
					color: "#affffd",
					transparent: true,
					opacity: 0.8,
					blending: AdditiveBlending,
					depthWrite: false,
				}),
			);
			circle.position.copy(origin);
			circle.quaternion.setFromUnitVectors(
				new Vector3(0, 0, 1),
				origin.clone().normalize(),
			);
			this.layers.scatter.add(circle);
			this.pulseRings.push(circle);
		}
		// 每个终点由四层构成：外圈光晕 Sprite、亮核小球、贴合球面的细圆环与中文铭牌
		destinations.forEach((destination) => {
			const end = spherical(destination.coordinates);
			const marker = new Sprite(
				new SpriteMaterial({
					map: this.textures.glow(),
					transparent: true,
					depthWrite: false,
					blending: AdditiveBlending,
				}),
			);
			marker.scale.setScalar(0.32);
			marker.position.copy(end);
			this.layers.scatter.add(marker);
			// 亮核半径 0.024，缩到最小视角时仍是一个亮点而不是方块；外推 0.2% 压在其他装饰之上
			const core = new Mesh(
				new SphereGeometry(0.024, 16, 12),
				new MeshBasicMaterial({
					color: new Color("#d9faff").multiplyScalar(1.6),
				}),
			);
			core.position.copy(end.clone().multiplyScalar(1.002));
			const ring = new Mesh(
				new TorusGeometry(0.065, 0.004, 6, 48),
				new MeshBasicMaterial({
					color: "#b8efff",
					transparent: true,
					opacity: 0.55,
					depthWrite: false,
					blending: AdditiveBlending,
				}),
			);
			ring.position.copy(end);
			ring.quaternion.setFromUnitVectors(
				new Vector3(0, 0, 1),
				end.clone().normalize(),
			);
			// 内核与圆环一起加入 scatter 图层，文案随后统一按偏离 0.17/0.14 的位置摆放，避免压住圆环
			this.layers.scatter.add(core, ring);
			// 铭牌宽度按字数估算，下限 108 避免两字城市（如东京）被裁切
			const labelWidth = Math.max(108, destination.name.length * 31 + 24);
			const label = this.textures.sprite(destination.name, {
				plate: true,
				simplePlate: true,
				size: 30,
				width: labelWidth,
				height: 64,
			});
			label.material.depthTest = true;
			label.scale.set(labelWidth * 0.0055, 0.32, 1);
			label.position
				.copy(end.clone().multiplyScalar(1.04))
				.add(new Vector3(0.17, 0.14, 0));
			this.layers.scatter.add(label);
		});
		// 货运航线独立封装，group 内包含铁路/海运/空运的飞线与沿线移动点，由逐帧逻辑推进进度
		this.freight = new GlobeFreight();
		this.layers.flyline.add(this.freight.group);
		// 光晕与星空直接挂 root：它们不随球体自转，需要始终面向镜头
		this.createGlobeRadiance();
		this.createGlobeBackground();
	}

	/**
	 * 创建大气光晕：一张 512×512 的径向渐变贴图贴在 Sprite 上，
	 * 直径与扫描球壳一致（GLOBE_SCAN_RADIUS×2），使光晕恰好扩散到球体轮廓处消失。
	 */
	private createGlobeRadiance() {
		// 光晕必须在扫描球壳的外轮廓处完全淡出，因此半径直接对齐 GLOBE_SCAN_RADIUS。
		const glowRadius = GLOBE_SCAN_RADIUS;
		const texture = this.textures.canvas(512, 512, (context) => {
			// 0.82 之前 alpha 只有 0.44~0.5（还要再乘 Sprite 的 0.65），是半透明亮盘，之后继续衰减到零
			const glow = context.createRadialGradient(256, 256, 0, 256, 256, 256);
			glow.addColorStop(0, "#208bec80");
			glow.addColorStop(0.82, "#208bec70");
			glow.addColorStop(0.86, "#157bdb4a");
			glow.addColorStop(0.92, "#116bd81a");
			glow.addColorStop(0.97, "#0c589008");
			glow.addColorStop(1, "#07509100");
			context.fillStyle = glow;
			context.fillRect(0, 0, 512, 512);
		});
		const radiance = new Sprite(
			new SpriteMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
				opacity: 0.65,
			}),
		);
		radiance.name = "globe-diffuse-radiance";
		radiance.scale.set(glowRadius * 2, glowRadius * 2, 1);
		this.radiance = radiance;
		this.root.add(radiance);
	}

	/**
	 * 创建扫描球壳：一层半径大于地球和云层的球体，用 shader 绘制自上而下移动的网格带。
	 * 扫描带只在球体正面显现（依赖加法混合与低透明度），不会遮挡背后的内容。
	 */
	private createGlobeScan() {
		// 扫描是一层悬浮球壳，与半径 5.1 的地球及其云层留出间隙，避免深度冲突。
		const radius = GLOBE_SCAN_RADIUS;
		const uniforms = { time: { value: 0 } };
		// 扫描位置以球体局部坐标的 y 表示：1.08（接近北极）线性下移到 -1.96（南半球），
		// 周期 6 秒；5.7 秒时扫描带已移出球体，5.75~5.95 秒的淡出仅作兜底，避免循环回跳时硬切
		const sweep = `uniform float time;
		float sweepHeight() {
			return mix(1.08, -1.96, min(mod(time, 6.) / 5.7, 1.));
		}
		float sweepFade() {
			float phase = mod(time, 6.);
			return smoothstep(0., .2, phase) * (1. - smoothstep(5.75, 5.95, phase));
		}`;
		// 分段数与地球保持一致（160×96），扫描带的纹路才能贴合地表曲率而不出现折线
		this.scan = new Mesh(
			new SphereGeometry(radius, 160, 96),
			new ShaderMaterial({
				uniforms,
				vertexShader: `varying vec3 vPosition;
				void main() {
					vPosition = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
				}`,
				fragmentShader: `${sweep}
				varying vec3 vPosition;
				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
				}
				void main() {
					float height = vPosition.y / ${radius.toFixed(2)};
					float distance = height - sweepHeight();
					float trailFade = 1. - smoothstep(0., .9, max(distance, 0.));
					float trail = pow(trailFade, 1.4) * smoothstep(-.004, .014, distance);
					vec2 grid = vPosition.xy * vec2(16., 20.);
					vec2 cell = fract(grid);
					vec2 aa = max(fwidth(grid), vec2(.001));
					vec2 edge = min(cell, 1. - cell);
					float columns = 1. - smoothstep(.018, .018 + aa.x, edge.x);
					float rows = 1. - smoothstep(.016, .016 + aa.y, edge.y);
					float dash = (1. - smoothstep(.18, .18 + aa.x, abs(cell.x - .5)))
						* (1. - smoothstep(.08, .08 + aa.y, abs(cell.y - .5)));
					float pixels = dash * mix(.3, 1., hash(floor(grid)));
					float pattern = columns * .10 + rows * .035 + pixels * .42;
					float core = 1. - smoothstep(.002, .005 + fwidth(height), abs(distance));
					float glow = exp(-abs(distance) * 55.);
					float opacity = trail * (.025 + pattern * .62);
					opacity += core * .035 + glow * .035;
					gl_FragColor = vec4(vec3(.06, .43, .92), opacity * sweepFade());
				}`,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		this.scan.name = "globe-scan";
		// 片元里用 fwidth 估算屏幕空间导数做抗锯齿，细网格在缩放时才不会乱闪
		// 扫描带是持续循环的装饰动画，命中「减少动态效果」偏好时整体隐藏
		this.scan.visible = !this.reducedMotion.matches;
		this.layers.scan.add(this.scan);
	}

	/**
	 * 创建环绕光带：一张 18×18 的平面置于地球外侧，shader 只在半径接近
	 * GLOBE_ORBIT_RADIUS 的环形区域绘制雾状噪点，其余片元 discard。
	 */
	private createGlobeFloatingRing() {
		// 雾状云环的边缘要柔和、不规则，因此不用实体轮廓，而用多层噪声叠加出宽度扰动。
		this.floatingRing = new Mesh(
			new PlaneGeometry(18, 18),
			new ShaderMaterial({
				uniforms: { time: { value: 0 } },
				vertexShader: `
				varying vec2 vPlane;
				void main() {
					vPlane = position.xy;
					vec3 p = vec3(position.x, -.25, position.y);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
				}`,
				fragmentShader: `
				uniform float time;
				varying vec2 vPlane;
				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
				}
				float noise(vec2 p) {
					vec2 i = floor(p), f = fract(p);
					f = f * f * (3. - 2. * f);
					return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
						mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
				}
				float mistNoise(vec2 p) {
					return noise(p) * .57 + noise(p * 2.03 + 4.1) * .28
						+ noise(p * 4.11 + 9.2) * .15;
				}
				void main() {
					float radius = length(vPlane);
					float distance = radius - ${GLOBE_ORBIT_RADIUS.toFixed(2)};
					if (abs(distance) > .95) discard;
					vec2 drift = vec2(time * .025, -time * .018);
					float cloud = mistNoise(vPlane * 2.8 + drift);
					float wisps = mistNoise(vPlane * 7.5 - drift * 1.3);
					float width = .16 + cloud * .17;
					float mist = exp(-pow((distance + (wisps - .5) * .08) / width, 2.));
					float rim = exp(-pow(distance / .055, 2.));
					float opacity = (mist * .065 + rim * .03) * (.45 + cloud * .55);
					opacity *= 1. - smoothstep(.65, .95, abs(distance));
					gl_FragColor = vec4(mix(vec3(.08, .31, .62),
						vec3(.19, .48, .79), wisps), opacity);
				}`,
				transparent: true,
				depthWrite: false,
				side: DoubleSide,
				forceSinglePass: true,
				blending: AdditiveBlending,
			}),
		);
		// 环带 ±0.95 之外的片元在 shader 里直接 discard，只有靠近 GLOBE_ORBIT_RADIUS 的区域参与混合，
		// 省下大量近乎全透明的像素开销
		this.floatingRing.name = "globe-floating-ring";
		// 先在「归位」姿态下把平面压成参考稿里的浅椭圆：设置旋转后立刻取逆，
		// 相当于抵消父级球体的朝向，再用 rotateX(0.12) 微微倾斜制造透视倾角
		this.floatingRing.rotation.set(GLOBE_HOME.x, GLOBE_HOME.y, GLOBE_HOME.z);
		this.floatingRing.quaternion.invert();
		this.floatingRing.rotateX(0.12);
		// 挂到球体上才能跟随拖拽、自转与归位，光环与地球始终保持同一变换
		this.mesh?.add(this.floatingRing);
	}

	/**
	 * 创建背景装饰：球体后方的星空点云与两条远景轨道椭圆环，全部挂到 effects 容器。
	 * 这些元素不参与拖拽交互，只在视觉上兜住画面四周。
	 */
	private createGlobeBackground() {
		// 线性同余伪随机（seed 固定为 92731），保证每次刷新星点位置完全一致，避免画面跳变
		let seed = 92731;
		const random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 4294967296;
		};
		const positions: number[] = [],
			colors: number[] = [];
		// 380 颗星散布在 45×30 的盒体内，z 取 -5~-27 保证全部落在球体背面，不会穿过地球
		for (let index = 0; index < 380; index++) {
			positions.push(
				(random() - 0.5) * 45,
				(random() - 0.5) * 30,
				-5 - random() * 22,
			);
			const light = 0.3 + random() * 0.7;
			colors.push(light * 0.65, light * 0.8, light);
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
		geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
		this.effects.add(
			new Points(
				geometry,
				new PointsMaterial({
					size: 0.045,
					map: this.textures.glow(),
					vertexColors: true,
					transparent: true,
					opacity: 0.75,
					depthWrite: false,
					blending: AdditiveBlending,
				}),
			),
		);
		// 两条椭圆轨道：半径分别为 7.8/5.9 与 8.8/6.9（内圈略显偏心），y 方向只保留 0.28 振幅形成扁平盘
		for (let index = 0; index < 2; index++) {
			const points: Vector3[] = [];
			for (let step = 0; step <= 180; step++) {
				const angle = (step / 180) * Math.PI * 2;
				points.push(
					new Vector3(
						Math.cos(angle) * (7.8 + index),
						Math.sin(angle) * 0.28,
						Math.sin(angle) * (5.9 + index),
					),
				);
			}
			const orbit = new LineLoop(
				new BufferGeometry().setFromPoints(points),
				new LineBasicMaterial({
					color: index ? "#5cbdde" : "#c3e6ed",
					transparent: true,
					opacity: index ? 0.08 : 0.12,
					blending: AdditiveBlending,
					depthWrite: false,
				}),
			);
			// 两环倾斜方向相反（+0.04 / -0.2 弧度）并压暗外层，形成交叉的远景透视感
			orbit.rotation.z = index ? -0.2 : 0.04;
			this.effects.add(orbit);
		}
	}
}

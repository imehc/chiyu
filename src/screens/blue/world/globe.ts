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

export default class GlobeScene {
	readonly root = new Group();
	readonly effects = new Group();
	readonly layers: Record<Layer, Group> = {
		flyline: new Group(),
		label: new Group(),
		point: new Group(),
		scatter: new Group(),
		heat: new Group(),
		region: new Group(),
		scan: new Group(),
	};
	mesh: Mesh | undefined;
	clouds: Mesh<SphereGeometry, ShaderMaterial> | undefined;
	scan: Mesh<SphereGeometry, ShaderMaterial> | undefined;
	floatingRing: Mesh<PlaneGeometry, ShaderMaterial> | undefined;
	radiance: Sprite | undefined;
	freight: GlobeFreight | undefined;
	readonly pulseRings: Mesh[] = [];

	constructor(
		private readonly textures: SceneTextures,
		private readonly reducedMotion: MediaQueryList,
	) {}

	async create(
		countries: FeatureCollection<Polygon | MultiPolygon>,
		china: FeatureCollection<Polygon | MultiPolygon>,
		outline: FeatureCollection<Polygon | MultiPolygon>,
		renderer: WebGLRenderer,
		isDestroyed: () => boolean,
	) {
		const texture = this.textures.canvas(2048, 1024, (context) => {
			context.fillStyle = "#041328";
			context.fillRect(0, 0, 2048, 1024);
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
					context.fill("evenodd");
					context.stroke();
				}
			};
			countries.features.forEach((feature) => {
				drawFeature(feature, "#16446d", "#3682ac");
			});
			china.features
				.filter((feature) => feature.properties?.name)
				.forEach((feature) => {
					drawFeature(feature, "#3587b7", "#b8eeff");
				});
			context.strokeStyle = "rgba(29,86,124,.32)";
			context.lineWidth = 0.7;
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
		this.mesh = new Mesh(
			new SphereGeometry(5.1, 160, 96),
			new MeshBasicMaterial({ map: texture }),
		);
		this.mesh.rotation.y = Math.PI * 0.94 + 0.6;
		this.mesh.rotation.x = Math.PI * 0.2;
		this.root.add(this.mesh);
		Object.entries(this.layers).forEach(([id, layer]) => {
			if (id === "scan") this.root.add(layer);
			else this.mesh?.add(layer);
		});
		const loader = new TextureLoader();
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
		if (failure || isDestroyed()) {
			textures.forEach((item) => {
				item.dispose();
			});
			if (failure) throw failure.reason;
			return;
		}
		const [surface, specular, clouds] = textures;
		textures.forEach((item) => {
			item.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
			this.textures.disposable.add(item);
		});
		surface.colorSpace = SRGBColorSpace;
		const old = this.mesh.material;
		(Array.isArray(old) ? old : [old]).forEach((material) => {
			material.dispose();
		});
		const material = new MeshBasicMaterial({ map: surface, color: "#e5f5ff" });
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
		this.mesh.material = material;
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
		this.mesh.add(this.clouds);
		this.createGlobeScan();
		this.createGlobeFloatingRing();
		const spherical = (coordinates: [number, number], radius = 5.165) => {
			const longitude = ((coordinates[0] + 180) * Math.PI) / 180;
			const latitude = (coordinates[1] * Math.PI) / 180;
			return new Vector3(
				-radius * Math.cos(longitude) * Math.cos(latitude),
				radius * Math.sin(latitude),
				radius * Math.sin(longitude) * Math.cos(latitude),
			);
		};
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
		const gridMaterial = new LineBasicMaterial({
			color: "#468ead",
			transparent: true,
			opacity: 0.1,
			depthWrite: false,
		});
		for (let longitude = -180; longitude < 180; longitude += 15) {
			const points: Vector3[] = [];
			for (let latitude = -89; latitude <= 89; latitude += 1)
				points.push(spherical([longitude, latitude], 5.148));
			appendSegments(points, gridPositions, false);
		}
		for (let latitude = -75; latitude <= 75; latitude += 15) {
			const points: Vector3[] = [];
			for (let longitude = -180; longitude <= 180; longitude += 1.5)
				points.push(spherical([longitude, latitude], 5.148));
			appendSegments(points, gridPositions);
		}
		addSegments(gridPositions, gridMaterial, this.layers.region);
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
		const originLabel = this.textures.sprite("北京", {
			plate: true,
			simplePlate: true,
			size: 30,
			width: 112,
			height: 64,
		});
		originLabel.material.depthTest = true;
		originLabel.scale.set(0.62, 0.32, 1);
		originLabel.position
			.copy(origin.clone().multiplyScalar(1.04))
			.add(new Vector3(0.18, 0.1, 0));
		this.layers.scatter.add(originLabel);
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
			this.layers.scatter.add(core, ring);
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
		this.freight = new GlobeFreight();
		this.layers.flyline.add(this.freight.group);
		this.createGlobeRadiance();
		this.createGlobeBackground();
	}

	private createGlobeRadiance() {
		// The light fades completely by the scan sphere's outer silhouette.
		const glowRadius = GLOBE_SCAN_RADIUS;
		const texture = this.textures.canvas(512, 512, (context) => {
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

	private createGlobeScan() {
		// The scan is a floating shell, clear of the 5.1-radius Earth and its clouds.
		const radius = GLOBE_SCAN_RADIUS;
		const uniforms = { time: { value: 0 } };
		const sweep = `uniform float time;
		float sweepHeight() {
			return mix(1.08, -1.96, min(mod(time, 6.) / 5.7, 1.));
		}
		float sweepFade() {
			float phase = mod(time, 6.);
			return smoothstep(0., .2, phase) * (1. - smoothstep(5.75, 5.95, phase));
		}`;
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
		this.scan.visible = !this.reducedMotion.matches;
		this.layers.scan.add(this.scan);
	}

	private createGlobeFloatingRing() {
		// A faint cloud ring, with soft, uneven edges rather than a solid outline.
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
		this.floatingRing.name = "globe-floating-ring";
		// Keep the reference's shallow ellipse at home, then inherit all sphere motion.
		this.floatingRing.rotation.set(GLOBE_HOME.x, GLOBE_HOME.y, GLOBE_HOME.z);
		this.floatingRing.quaternion.invert();
		this.floatingRing.rotateX(0.12);
		// Use the sphere's transform so dragging, auto-rotation and reset stay in sync.
		this.mesh?.add(this.floatingRing);
	}

	private createGlobeBackground() {
		let seed = 92731;
		const random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 4294967296;
		};
		const positions: number[] = [],
			colors: number[] = [];
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
			orbit.rotation.z = index ? -0.2 : 0.04;
			this.effects.add(orbit);
		}
	}
}

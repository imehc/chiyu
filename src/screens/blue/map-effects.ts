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
type TextureKey =
	| keyof typeof texturePaths
	| "point"
	| "scatter"
	| "scatterCore";

const ENTRANCE_DURATION = 4.8;

/** China dashboard textures and effects, expressed in the active map's local XY plane. */
export default class MapEffects {
	readonly group = new Group();
	private readonly textures = new Map<TextureKey, Texture>();
	private readonly boundaryTextures = new Set<Texture>();
	private readonly time = { value: 0 };
	private readonly rotationSpeed = { value: 0.07068583 };
	private readonly rotationAngle = { value: 0 };
	private readonly reveal = { value: 0 };
	private readonly entrance = { value: 0 };
	private readonly rotations: { mesh: Mesh; speed: number }[] = [];
	private readonly pulses: {
		mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
		offset: number;
	}[] = [];
	private readonly waveHeight = { value: -0.62 };
	private age = 0;
	private entranceDelay = 0;
	private exiting = false;
	private exitRevealScale = 1;
	private previousSeconds: number | undefined;
	private disposed = false;
	private loaded = false;

	async load() {
		if (this.loaded) return;
		const loader = new TextureLoader();
		await Promise.all(
			Object.entries(texturePaths).map(async ([name, path]) => {
				const texture = await loader.loadAsync(path);
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
		for (const key of ["path", "flyline"] as const) {
			const texture = this.texture(key);
			texture.wrapS = texture.wrapT = RepeatWrapping;
		}
		this.texture("flyline").repeat.set(0.5, 2);
		this.createEnvironment();
		this.loaded = true;
	}

	private texture(key: TextureKey) {
		return this.textures.get(key) as Texture;
	}

	get sharedTextures() {
		return this.textures.values();
	}

	private createMarkerTextures() {
		for (const key of ["point", "scatter", "scatterCore"] as const) {
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 128;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Unable to draw map markers.");
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
				// A white industrial pictogram inside the blue diamond.
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
				const core = context.createRadialGradient(64, 64, 0, 64, 64, 64);
				core.addColorStop(0, "#ffffff");
				core.addColorStop(0.48, "#efffff");
				core.addColorStop(0.62, "#9ffff0d9");
				core.addColorStop(0.8, "#6fffdc00");
				core.addColorStop(1, "#6fffdc00");
				context.fillStyle = core;
				context.fillRect(0, 0, 128, 128);
			} else {
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

	private createEnvironment() {
		this.group.name = "ChinaDashboardEffects";
		this.createGroundRipples();
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
		const positions: number[] = [],
			uvs: number[] = [],
			indices: number[] = [];
		for (let i = 0; i < 60; i++) {
			const angle = (i * Math.PI * 2) / 60;
			const radialX = Math.cos(angle);
			const radialY = Math.sin(angle);
			const length = i % 2 === 0 ? 0.4 : 0.2;
			const radius = 7.3 - length / 2;
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
		glints.frustumCulled = false;
		glints.raycast = () => undefined;
		this.group.add(glints);
		this.setRegion();
	}

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

	setRegion(x = 0, y = 0, span = 15, _surface = 0.48) {
		const scale = Math.max(span / 15, 0.00001);
		this.group.position.set(x, y, 0);
		this.group.scale.setScalar(scale);
		this.waveHeight.value = -0.62;
		this.restartEntrance(0.35);
	}

	restartEntrance(delay = 0) {
		this.age = 0;
		this.entranceDelay = Math.max(0, delay);
		this.exiting = false;
		this.reveal.value = 0;
		this.entrance.value = 0;
		this.rotationAngle.value = 0;
		this.previousSeconds = undefined;
	}

	startExit(): { value: number } {
		this.exiting = true;
		this.exitRevealScale =
			this.entrance.value > 0 ? this.reveal.value / this.entrance.value : 0;
		return this.entrance;
	}

	cancelExit() {
		this.exiting = false;
		this.entrance.value = 1;
		this.reveal.value = 1;
		this.age = this.entranceDelay + ENTRANCE_DURATION;
		this.previousSeconds = undefined;
	}

	stroke(
		rings: Vector3[][],
		scale: number,
		gridBounds = new Vector3(-7.5, -4, 15),
	) {
		const group = new Group();
		group.name = "ChinaGlowingBoundary";
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
						const y = (maxY - point.y) * resolution;
						if (index === 0) land.moveTo(x, y);
						else land.lineTo(x, y);
					});
					land.closePath();
				}
				// Clip before blurring so the inward fade cannot spill across concave coasts.
				context.clip(land);
				// This mask only controls dot brightness; it is never rendered as a solid glow.
				for (const [breadth, opacity] of [
					[0.92, 0.5],
					[0.38, 0.5],
				]) {
					const fadeWidth = Math.max(2, breadth * scale * resolution);
					context.filter = `blur(${fadeWidth * 0.55}px)`;
					context.lineWidth = fadeWidth * 0.8;
					context.strokeStyle = "#ffffff";
					context.globalAlpha = opacity;
					context.stroke(land);
				}
				const texture = new CanvasTexture(canvas);
				texture.colorSpace = SRGBColorSpace;
				this.boundaryTextures.add(texture);
				const dots = new Mesh(
					new PlaneGeometry(width, height),
					new ShaderMaterial({
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
				dots.renderOrder = 8;
				group.add(dots);
			}
		}
		for (const ring of rings) {
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

	flyline(curve: import("three").QuadraticBezierCurve3, scale = 1, index = 0) {
		const group = new Group();
		const color = index % 3 === 1 ? "#ff98d6" : "#80eaff";
		const mesh = new Mesh(
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
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		mesh.name = "ChinaFlowingFlyline";
		mesh.renderOrder = 12;
		group.add(mesh, this.focus(curve.v2, scale * 0.4, true, color));
		return group;
	}

	private lightBeam(height: number, width: number, color: string) {
		const group = new Group();
		for (const [key, breadth, tint, opacity] of [
			["glow", width * 2.4, color, 0.38],
			["focusBar", width, color, 0.76],
			["focusBar", width * 0.2, "#f5ffff", 0.94],
		] as const) {
			const geometry = new PlaneGeometry(breadth, height);
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
			beam.renderOrder = tint === "#f5ffff" ? 13 : 12;
			beam.rotation.x = Math.PI / 2;
			const partner = beam.clone();
			partner.rotation.y = Math.PI / 2;
			group.add(beam, partner);
		}
		return group;
	}

	focus(position: Vector3, scale = 1, beam = true, color = "#b8dcff") {
		const group = new Group();
		group.position.copy(position);
		group.scale.setScalar(scale);
		for (const [key, speed, opacity, size] of [
			["focusBg", 0, 0.48, 1.7],
			["focusRing", 0.28, 0.88, 1.55],
			["focusArrows", -0.18, 0.8, 1.85],
		] as const) {
			const plane = this.plane(key, size, opacity, color);
			plane.position.z = 0.008;
			plane.renderOrder = 12;
			group.add(plane);
			if (speed) this.rotations.push({ mesh: plane, speed });
		}
		const core = this.plane("scatter", 0.9, 0.9, "#ffffff");
		core.position.z = 0.012;
		core.renderOrder = 13;
		group.add(core);
		const pulse = this.plane("focusPulse", 1.7, 0.5, color);
		pulse.renderOrder = 12;
		group.add(pulse);
		this.pulses.push({ mesh: pulse, offset: this.pulses.length * 0.18 });
		if (beam) {
			group.add(this.lightBeam(3.4, 0.22, color));
		}
		return group;
	}

	scatter(position: Vector3, size: number) {
		const group = new Group();
		group.name = "ChinaDimensionalScatter";
		group.position.copy(position);
		const height = size * 0.72;
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
			new BoxGeometry(size * 0.11, size * 0.11, height),
			new MeshBasicMaterial({
				color: "#9af9da",
				opacity: 0.48,
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending,
			}),
		);
		stem.position.z = height / 2;
		stem.renderOrder = 12;
		group.add(stem, glow, core);
		return group;
	}

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
		marker.material.depthTest = false;
		marker.userData.name = `监测点-${index + 1}`;
		return { group, marker };
	}

	private visible(object: Object3D) {
		let current: Object3D | null = object;
		while (current) {
			if (!current.visible) return false;
			if (current.type === "Scene") return true;
			current = current.parent;
		}
		return false;
	}

	update(seconds: number, reducedMotion: boolean) {
		if (!this.loaded || this.disposed) return;
		const delta = this.visible(this.group)
			? Math.min(0.1, Math.max(0, seconds - (this.previousSeconds ?? seconds)))
			: 0;
		this.previousSeconds = seconds;
		if (!reducedMotion) this.time.value += delta;
		const previousEntranceAge = Math.max(0, this.age - this.entranceDelay);
		this.age += delta;
		const entranceAge = Math.max(0, this.age - this.entranceDelay);
		if (!reducedMotion) {
			const rotationDelta = this.exiting
				? delta
				: entranceAge - previousEntranceAge;
			this.rotationAngle.value += rotationDelta * this.rotationSpeed.value;
		}
		if (this.exiting) {
			this.reveal.value = Math.max(
				0,
				this.entrance.value * this.exitRevealScale,
			);
		} else {
			this.reveal.value = reducedMotion ? 1 : Math.min(1, entranceAge / 1.3);
			const entranceProgress = Math.min(1, entranceAge / ENTRANCE_DURATION);
			this.entrance.value = reducedMotion ? 1 : 1 - (1 - entranceProgress) ** 2;
		}
		this.texture("flyline").offset.x = -this.time.value * 0.36;
		for (const { mesh, speed } of this.rotations) {
			if (!this.visible(mesh)) continue;
			mesh.rotation.z = this.time.value * speed;
			if (mesh.parent === this.group)
				mesh.scale.setScalar(
					Math.sin((Math.min(1, entranceAge / 1.3) * Math.PI) / 2),
				);
		}
		for (const { mesh, offset } of this.pulses) {
			if (!this.visible(mesh)) continue;
			const phase = (this.time.value / 3.3 + offset) % 1;
			mesh.scale.setScalar(phase * 1.5);
			mesh.material.opacity = (1 - phase) * 0.5;
		}
	}

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
					const mask = material.uniforms.boundaryMask?.value as
						| Texture
						| undefined;
					if (mask && this.boundaryTextures.delete(mask)) mask.dispose();
				}
				if (material instanceof MeshBasicMaterial && material.map)
					this.boundaryTextures.delete(material.map);
			}
		});
		for (const list of [this.rotations, this.pulses]) {
			for (let i = list.length - 1; i >= 0; i--)
				if (removed.has(list[i].mesh)) list.splice(i, 1);
		}
	}

	dispose() {
		this.disposed = true;
		for (const texture of this.textures.values()) texture.dispose();
		for (const texture of this.boundaryTextures) texture.dispose();
		this.boundaryTextures.clear();
		this.textures.clear();
		this.rotations.length = this.pulses.length = 0;
	}
}

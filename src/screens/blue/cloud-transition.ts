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

/** Bake periodic value noise once; the fragment shader only samples this R8 map. */
function createCloudNoise() {
	const width = 256;
	const height = 128;
	let seed = 0x71384a1;
	const random = () => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 4294967296;
	};
	const weights = [0.52, 0.27, 0.14, 0.07];
	const layers = [4, 8, 16, 32].map((columns, index) => {
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
				const x1 = (x0 + 1) % columns;
				const y1 = (y0 + 1) % rows;
				const fx = gx - x0;
				const fy = gy - y0;
				const sx = fx * fx * (3 - 2 * fx);
				const sy = fy * fy * (3 - 2 * fy);
				const top =
					grid[y0 * columns + x0] * (1 - sx) + grid[y0 * columns + x1] * sx;
				const bottom =
					grid[y1 * columns + x0] * (1 - sx) + grid[y1 * columns + x1] * sx;
				value += (top * (1 - sy) + bottom * sy) * weight;
			}
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
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

/** A moving cloud bank composited over the finished frame, without another target. */
export default class CloudTransition {
	readonly progress = { value: 0 };
	private readonly scene = new Scene();
	private readonly noise = createCloudNoise();
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
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	private readonly plane = new Mesh(this.geometry, this.material);
	private disposed = false;

	constructor() {
		this.plane.frustumCulled = false;
		this.scene.add(this.plane);
	}

	get active() {
		return !this.disposed && this.progress.value > 0 && this.progress.value < 1;
	}

	/** Call after the composer has rendered; the screen-space shader ignores projection. */
	render(renderer: WebGLRenderer, camera: Camera) {
		if (!this.active) return;
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		try {
			renderer.render(this.scene, camera);
		} finally {
			renderer.autoClear = autoClear;
		}
	}

	clear() {
		this.progress.value = 0;
	}

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

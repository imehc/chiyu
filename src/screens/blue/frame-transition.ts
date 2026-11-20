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

/** Dissolves one GPU snapshot over the live scene without rendering both maps. */
export default class FrameTransition {
	readonly opacity = { value: 0 };
	private readonly scene = new Scene();
	private readonly geometry = new PlaneGeometry(2, 2);
	private readonly capturedViewProjection = new Matrix4();
	private readonly capturedMapMatrix = new Matrix4();
	private readonly currentViewProjection = new Matrix4();
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
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	private readonly plane = new Mesh(this.geometry, this.material);
	private readonly size = new Vector2();
	private texture: FramebufferTexture | undefined;
	private disposed = false;

	constructor() {
		this.plane.frustumCulled = false;
		this.scene.add(this.plane);
	}

	get active() {
		return this.texture !== undefined;
	}

	get bytes() {
		return this.texture
			? this.texture.image.width * this.texture.image.height * 4
			: 0;
	}

	/** Call after the composer and any active dissolve have rendered to screen. */
	capture(renderer: WebGLRenderer, camera: PerspectiveCamera, map: Object3D) {
		if (this.disposed) return false;
		renderer.getDrawingBufferSize(this.size);
		if (this.size.x < 1 || this.size.y < 1) return false;
		const texture = new FramebufferTexture(this.size.x, this.size.y);
		texture.minFilter = texture.magFilter = LinearFilter;
		// The framebuffer already contains display-space sRGB bytes. Leaving the
		// texture untagged and omitting shader color conversion preserves them.
		try {
			renderer.copyFramebufferToTexture(texture);
		} catch (error) {
			texture.dispose();
			throw error;
		}
		this.texture?.dispose();
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

	/** Render after postprocessing so the captured frame is not bloomed again. */
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
		// Reproject through geographic coordinates so zoom, tilt and rotation
		// carry the old map along the same ground plane as the incoming map.
		this.material.uniforms.sourceProjection.value
			.copy(this.capturedViewProjection)
			.multiply(this.capturedMapMatrix)
			.multiply(this.inverseMapMatrix);
		this.material.uniforms.planeHeight.value = planeHeight;
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;
		try {
			renderer.render(this.scene, camera);
		} finally {
			renderer.autoClear = autoClear;
		}
	}

	clear() {
		this.opacity.value = 0;
		this.material.uniforms.snapshot.value = null;
		this.texture?.dispose();
		this.texture = undefined;
	}

	dispose() {
		if (this.disposed) return;
		this.clear();
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
		this.scene.remove(this.plane);
	}
}

import gsap from "gsap";
import { Material, type Object3D, ShaderMaterial } from "three";

interface LayerState {
	value: number;
	enabled: boolean;
	tween?: gsap.core.Tween;
}

export interface LayerMotionOptions {
	enterDuration?: number;
	exitDuration?: number;
	delay?: number;
	ease?: string;
}

type RenderObject = Object3D & { material: Material | Material[] };

interface MaterialBinding {
	object: RenderObject;
	original: Material | Material[];
	managed: Material | Material[];
	materials: Set<Material>;
	reveal: { value: number };
	roots: Map<LayerMotion, Set<Object3D>>;
}

const statesByManager = new Map<LayerMotion, Map<Object3D, LayerState>>();
const bindingsByObject = new WeakMap<Object3D, MaterialBinding>();
const bindings = new Set<MaterialBinding>();
const revealUniform = "blueLayerReveal";

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

/** Insert after the fragment's own color/opacity calculations, including hooks. */
function withReveal(fragment: string) {
	const main = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.exec(fragment);
	if (!main) return fragment;
	let depth = 1;
	let lineComment = false;
	let blockComment = false;
	for (
		let index = main.index + main[0].length;
		index < fragment.length;
		index++
	) {
		const character = fragment[index];
		const next = fragment[index + 1];
		if (lineComment) {
			if (character === "\n") lineComment = false;
			continue;
		}
		if (blockComment) {
			if (character === "*" && next === "/") {
				blockComment = false;
				index++;
			}
			continue;
		}
		if (character === "/" && next === "/") {
			lineComment = true;
			index++;
			continue;
		}
		if (character === "/" && next === "*") {
			blockComment = true;
			index++;
			continue;
		}
		if (character === "{") {
			depth++;
			continue;
		}
		if (character !== "}") continue;
		depth--;
		if (depth !== 0) continue;
		const shader = `${fragment.slice(0, index)}\n gl_FragColor.a *= ${revealUniform};\n${fragment.slice(index)}`;
		const declaration = `uniform float ${revealUniform};\n`;
		const version = /^\s*#version[^\n]*\n/.exec(shader);
		return version
			? `${shader.slice(0, version[0].length)}${declaration}${shader.slice(version[0].length)}`
			: declaration + shader;
	}
	return fragment;
}

function isRenderObject(object: Object3D): object is RenderObject {
	const material = (object as RenderObject).material;
	return material instanceof Material || Array.isArray(material);
}

function revealFor(object: Object3D) {
	let reveal = 1;
	for (
		let current: Object3D | null = object;
		current;
		current = current.parent
	) {
		for (const states of statesByManager.values()) {
			reveal *= states.get(current)?.value ?? 1;
		}
	}
	return reveal;
}

function refreshBindings() {
	for (const binding of bindings) {
		binding.reveal.value = revealFor(binding.object);
	}
}

function refreshVisibility(object: Object3D) {
	let visible = true;
	let managed = false;
	for (const states of statesByManager.values()) {
		const state = states.get(object);
		if (!state) continue;
		managed = true;
		visible &&= state.value > 0 || state.enabled;
	}
	if (managed) object.visible = visible;
}

function makeMaterial(source: Material, reveal: { value: number }) {
	const material = source.clone();
	// Existing effect clocks, hovered state and map-bound uniforms stay live.
	if (source instanceof ShaderMaterial && material instanceof ShaderMaterial) {
		material.uniforms = { ...source.uniforms, [revealUniform]: reveal };
	}
	material.userData = source.userData;
	const compile = source.onBeforeCompile;
	const cacheKey = source.customProgramCacheKey();
	material.onBeforeCompile = function (shader, renderer) {
		compile.call(this, shader, renderer);
		shader.uniforms[revealUniform] = reveal;
		shader.fragmentShader = withReveal(shader.fragmentShader);
	};
	material.customProgramCacheKey = () => `${cacheKey}|blue-layer-reveal-v1`;
	// Keep the render mode stable throughout the motion, including its endpoints.
	// Restoring the original material on release also restores its depth behavior.
	material.transparent = true;
	material.depthWrite = false;
	material.forceSinglePass = true;
	return material;
}

function releaseBinding(binding: MaterialBinding) {
	if (binding.object.material === binding.managed) {
		binding.object.material = binding.original;
	}
	for (const material of binding.materials) material.dispose();
	bindings.delete(binding);
	bindingsByObject.delete(binding.object);
}

function bindObject(
	object: RenderObject,
	manager: LayerMotion,
	root: Object3D,
) {
	let binding = bindingsByObject.get(object);
	if (binding && object.material !== binding.managed) {
		releaseBinding(binding);
		binding = undefined;
	}
	if (!binding) {
		const original = object.material;
		const reveal = { value: revealFor(object) };
		const copies = new Map<Material, Material>();
		const copy = (source: Material) => {
			let material = copies.get(source);
			if (!material) {
				material = makeMaterial(source, reveal);
				copies.set(source, material);
			}
			return material;
		};
		const managed = Array.isArray(original)
			? original.map(copy)
			: copy(original);
		binding = {
			object,
			original,
			managed,
			materials: new Set(copies.values()),
			reveal,
			roots: new Map(),
		};
		object.material = managed;
		bindingsByObject.set(object, binding);
		bindings.add(binding);
	}
	let roots = binding.roots.get(manager);
	if (!roots) {
		roots = new Set();
		binding.roots.set(manager, roots);
	}
	roots.add(root);
}

/** Fades rendered alpha independently of the map's own per-frame opacity. */
export default class LayerMotion {
	private readonly states = new Map<Object3D, LayerState>();
	private disposed = false;

	constructor() {
		statesByManager.set(this, this.states);
	}

	private stateFor(root: Object3D) {
		let state = this.states.get(root);
		if (!state) {
			state = { value: root.visible ? 1 : 0, enabled: root.visible };
			this.states.set(root, state);
		}
		return state;
	}

	initialize(root: Object3D, enabled: boolean) {
		if (this.disposed) return;
		const state = this.stateFor(root);
		state.tween?.kill();
		state.tween = undefined;
		state.enabled = enabled;
		state.value = enabled ? 1 : 0;
		refreshVisibility(root);
		this.sync(root);
		refreshBindings();
	}

	setVisible(
		root: Object3D,
		enabled: boolean,
		reducedMotion = false,
		options: LayerMotionOptions = {},
	) {
		if (this.disposed) return;
		const state = this.stateFor(root);
		state.tween?.kill();
		state.tween = undefined;
		state.enabled = enabled;
		this.sync(root);
		const target = enabled ? 1 : 0;
		if (reducedMotion || state.value === target) {
			state.value = target;
			refreshVisibility(root);
			refreshBindings();
			return;
		}
		refreshVisibility(root);
		const duration = enabled
			? (options.enterDuration ?? 0.72)
			: (options.exitDuration ?? 0.48);
		state.tween = gsap.to(state, {
			value: target,
			duration: duration * Math.max(0.35, Math.abs(target - state.value)),
			delay: options.delay ?? 0,
			ease: options.ease ?? "sine.inOut",
			onUpdate: refreshBindings,
			onComplete: () => {
				state.tween = undefined;
				refreshVisibility(root);
				refreshBindings();
			},
		});
	}

	setProgress(root: Object3D, value: number) {
		if (this.disposed) return;
		const existing = this.states.has(root);
		const state = this.stateFor(root);
		state.tween?.kill();
		state.tween = undefined;
		state.value = clampProgress(value);
		state.enabled = state.value > 0;
		refreshVisibility(root);
		if (!existing) this.sync(root);
		refreshBindings();
	}

	getProgress(root: Object3D) {
		return this.states.get(root)?.value ?? (root.visible ? 1 : 0);
	}

	isEnabled(root: Object3D) {
		return this.states.get(root)?.enabled ?? root.visible;
	}

	/** Registers late-loading geometry without changing nested visibility flags. */
	sync(root?: Object3D) {
		if (this.disposed) return;
		for (const target of root ? [root] : this.states.keys()) {
			target.traverse((object) => {
				if (isRenderObject(object)) bindObject(object, this, target);
			});
		}
	}

	/** Keep each entity's native depth behavior when fading separate map passes. */
	preserveDepth(root: Object3D) {
		if (this.disposed) return;
		root.traverse((object) => {
			const binding = bindingsByObject.get(object);
			if (!binding) return;
			const original = Array.isArray(binding.original)
				? binding.original
				: [binding.original];
			const managed = Array.isArray(binding.managed)
				? binding.managed
				: [binding.managed];
			managed.forEach((material, index) => {
				material.depthWrite = original[index].depthWrite;
			});
		});
	}

	update() {
		if (this.disposed) return;
		this.sync();
		refreshBindings();
	}

	/** Call before disposing a subtree, so its original materials remain owned there. */
	forget(root: Object3D) {
		const subtree = new Set<Object3D>();
		root.traverse((object) => subtree.add(object));
		for (const object of subtree) {
			this.states.get(object)?.tween?.kill();
			this.states.delete(object);
		}
		for (const binding of [...bindings]) {
			const roots = binding.roots.get(this);
			if (!roots) continue;
			if (subtree.has(binding.object)) {
				binding.roots.delete(this);
			} else {
				for (const target of roots) {
					if (subtree.has(target)) roots.delete(target);
				}
				if (!roots.size) binding.roots.delete(this);
			}
			if (!binding.roots.size) releaseBinding(binding);
		}
		refreshBindings();
	}

	release(root: Object3D) {
		this.forget(root);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const state of this.states.values()) state.tween?.kill();
		this.states.clear();
		statesByManager.delete(this);
		for (const binding of [...bindings]) {
			binding.roots.delete(this);
			if (!binding.roots.size) releaseBinding(binding);
		}
		refreshBindings();
	}
}

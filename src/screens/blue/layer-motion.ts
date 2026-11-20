/**
 * 图层显隐动画。
 * Three.js 的 visible 是布尔量，无法直接做淡入淡出，因此这里为参与动画的对象
 * 克隆一份材质，向片元着色器注入 `blueLayerReveal` 系数，用 GSAP 补间该 uniform 实现 alpha 渐变；
 * 动画结束后再按可见性决定是否保留 visible，避免透明物体继续参与绘制。
 * 由 world/view 等控制器在图层开关、下钻换图时调用。
 */
import gsap from "gsap";
import { Material, type Object3D, ShaderMaterial } from "three";

/** 单个受管根节点的动画状态；value 为当前显隐进度（0~1） */
interface LayerState {
	value: number;
	enabled: boolean;
	tween?: gsap.core.Tween;
}

/** 显隐补间参数，均可省略，缺省值见 setVisible */
export interface LayerMotionOptions {
	enterDuration?: number;
	exitDuration?: number;
	delay?: number;
	ease?: string;
}

/** 带材质的可渲染对象；用于把 Object3D 收窄到能安全换材质的类型 */
type RenderObject = Object3D & { material: Material | Material[] };

/** 一个对象与其克隆材质的绑定关系，跨多个 LayerMotion 实例共享 */
interface MaterialBinding {
	object: RenderObject;
	/** 原始材质，释放时还原，所有权仍在原对象/资源管理器 */
	original: Material | Material[];
	/** 注入过 reveal 的克隆材质，真正挂在对象上 */
	managed: Material | Material[];
	materials: Set<Material>;
	/** 与克隆材质共享的 reveal uniform，改这里即可影响该对象所有材质 */
	reveal: { value: number };
	/** 记录哪些管理器、哪个根节点在使用这份绑定，用于精确释放 */
	roots: Map<LayerMotion, Set<Object3D>>;
}

/** 管理器 → 根节点 → 状态；用于跨管理器连乘嵌套图层的不透明度 */
const statesByManager = new Map<LayerMotion, Map<Object3D, LayerState>>();
/** 对象 → 材质绑定；WeakMap 保证对象被回收时绑定不会造成泄漏 */
const bindingsByObject = new WeakMap<Object3D, MaterialBinding>();
/** 当前所有活跃绑定，用于批量刷新 uniform */
const bindings = new Set<MaterialBinding>();
/** 注入到 shader 的 uniform 名，同时作为缓存键的一部分 */
const revealUniform = "blueLayerReveal";

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 在片元着色器 main 的结尾（最后一个右花括号前）插入 alpha 衰减。
 * 需要手动扫描而非简单替换，是因为要跳过注释与嵌套代码块，避免误插到 if/for 内部；
 * 插在最后可以保证它作用在材质自身算出的 alpha 之上，而不是被后续赋值覆盖。
 * @param fragment 原始片元着色器源码
 * @returns 注入声明与乘法语句后的源码；找不到 main 时原样返回
 */
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
		// #version 必须位于所有声明之前（GLSL ES 3.0 要求），因此要插在版本行之后
		const version = /^\s*#version[^\n]*\n/.exec(shader);
		return version
			? `${shader.slice(0, version[0].length)}${declaration}${shader.slice(version[0].length)}`
			: declaration + shader;
	}
	return fragment;
}

/** 判断对象是否带材质（Material 或材质数组），用于 filter 掉 Group、Light 等非渲染节点 */
function isRenderObject(object: Object3D): object is RenderObject {
	const material = (object as RenderObject).material;
	return material instanceof Material || Array.isArray(material);
}

/**
 * 计算对象最终的显隐系数：沿父链把各管理器在该节点上的进度连乘。
 * 连乘而不是取最小值，是为了让嵌套图层（例如行政区下的子图层）叠加衰减，
 * 父级隐藏到 0 时子级无论自身状态如何都会一并消失。
 */
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

/** 把所有绑定的 uniform 同步到最新进度；补间 onUpdate 与状态变更后都会调用 */
function refreshBindings() {
	for (const binding of bindings) {
		binding.reveal.value = revealFor(binding.object);
	}
}

/**
 * 根据进度同步 object.visible。
 * 只有在进度归零且目标状态为关闭时才隐藏，保证退场动画期间仍会被绘制；
 * 不在此处处理父级可见性，父级隐藏由 Three.js 的层叠规则自然生效。
 */
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

/**
 * 克隆材质并注入 reveal uniform。
 * 之所以必须克隆：原材质可能被多个对象共享（例如同一份飞线材质），
 * 直接改 uniform 会让所有使用者一起变透明；克隆后每个对象拥有独立进度。
 * 克隆时保留原 uniform 表、userData 与 onBeforeCompile，使效果时钟、悬停状态继续生效。
 */
function makeMaterial(source: Material, reveal: { value: number }) {
	const material = source.clone();
	// 现有特效时钟、悬停状态与地图相关 uniform 保持联动（浅拷贝后共享引用）
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
	// 追加版本后缀：避免与未注入的同类材质共用程序缓存，否则会拿到没有 reveal 的 shader
	material.customProgramCacheKey = () => `${cacheKey}|blue-layer-reveal-v1`;
	// 整个动画期间固定渲染模式（含两端），避免中途切换 transparent 引发排序跳变；
	// 释放时还原原材质，深度行为也随之恢复。
	material.transparent = true;
	material.depthWrite = false;
	material.forceSinglePass = true;
	return material;
}

/** 还原原材质、销毁克隆并清除两处索引；由引用计数归零时调用 */
function releaseBinding(binding: MaterialBinding) {
	if (binding.object.material === binding.managed) {
		binding.object.material = binding.original;
	}
	for (const material of binding.materials) material.dispose();
	bindings.delete(binding);
	bindingsByObject.delete(binding.object);
}

/**
 * 为对象建立（或复用）材质绑定，并登记管理器与根节点的归属。
 * 若对象已被外部换过材质，说明绑定已过期，先释放再重建。
 */
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
		// 同一对象内重复出现的材质只克隆一次，减少程序与显存开销
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

/**
 * 图层显隐动画管理器。
 * 每个实例管理一组根节点（通常是一个图层 Group），进度按根节点记录；
 * 具体对象的最终 alpha 由所有管理器沿父链连乘得到，因此多个图层可以独立叠加动画。
 */
export default class LayerMotion {
	private readonly states = new Map<Object3D, LayerState>();
	private disposed = false;

	constructor() {
		// 注册到全局表，revealFor 需要遍历所有管理器的状态
		statesByManager.set(this, this.states);
	}

	/** 取根节点状态；首次访问时按当前 visible 推断初始进度，避免动画从错误的一端开始 */
	private stateFor(root: Object3D) {
		let state = this.states.get(root);
		if (!state) {
			state = { value: root.visible ? 1 : 0, enabled: root.visible };
			this.states.set(root, state);
		}
		return state;
	}

	/** 初始化根节点状态：不播放动画，直接落到目标值，用于首次构建场景 */
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

	/**
	 * 淡入 / 淡出某个根节点。
	 * @param enabled 目标可见性
	 * @param reducedMotion 为 true 时跳过补间，直接切换到终值
	 * @param options 时长、延迟与缓动；缺省入场 0.72s、退场 0.48s
	 */
	setVisible(
		root: Object3D,
		enabled: boolean,
		reducedMotion = false,
		options: LayerMotionOptions = {},
	) {
		if (this.disposed) return;
		const state = this.stateFor(root);
		// 先 kill 旧补间再建新的：快速连点开关时避免两个 tween 同时写同一个 value
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
			// 按剩余距离缩短时长，中途反向时不会出现「先慢慢走完再回头」
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

	/** 直接设置进度（不做补间），用于滚动、加载等外部驱动的连续变化 */
	setProgress(root: Object3D, value: number) {
		if (this.disposed) return;
		const existing = this.states.has(root);
		const state = this.stateFor(root);
		state.tween?.kill();
		state.tween = undefined;
		state.value = clampProgress(value);
		state.enabled = state.value > 0;
		refreshVisibility(root);
		// 新根节点首次出现时才需要遍历建绑定，已有节点只需刷新 uniform
		if (!existing) this.sync(root);
		refreshBindings();
	}

	getProgress(root: Object3D) {
		return this.states.get(root)?.value ?? (root.visible ? 1 : 0);
	}

	isEnabled(root: Object3D) {
		return this.states.get(root)?.enabled ?? root.visible;
	}

	/** 为后加载的几何体补建材质绑定；不改动已有的嵌套 visible 标记 */
	sync(root?: Object3D) {
		if (this.disposed) return;
		for (const target of root ? [root] : this.states.keys()) {
			target.traverse((object) => {
				if (isRenderObject(object)) bindObject(object, this, target);
			});
		}
	}

	/** 为需要保留深度关系的独立绘制通道恢复各自原有的 depthWrite 设置 */
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

	/** 每帧调用：拾取场景中新增的渲染对象并刷新一次 uniform */
	update() {
		if (this.disposed) return;
		this.sync();
		refreshBindings();
	}

	/**
	 * 断开某棵子树的全部状态与绑定。
	 * 必须在销毁子树之前调用，否则克隆材质会随对象一起失去引用，无法释放。
	 */
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
			// 没有任何管理器再引用时才真正释放，防止共享材质被提前销毁
			if (!binding.roots.size) releaseBinding(binding);
		}
		refreshBindings();
	}

	/** forget 的语义别名，供资源管理器在卸载图层时调用 */
	release(root: Object3D) {
		this.forget(root);
	}

	/** 停止所有补间并注销自身，只释放属于自己的绑定引用 */
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

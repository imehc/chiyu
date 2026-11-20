/**
 * 3D 地图生命周期入口：资源加载进度 → 创建场景 → 播放动画 → UI 入场 → 销毁。
 * 只负责通用流程编排，具体场景元素与镜头由各屏的 world 类实现（见 screens/<name>/world.ts）。
 * 由各屏 index.tsx 在 onMount 中创建，onCleanup 时调用 destroy。
 */
import gsap from "gsap";
import Assets from "./assets";
import type { ResourceAssets } from "./utils/resource";
import type Time from "./utils/time";

/** 每个大屏的 world 类可选的构造参数 */
export interface MapWorldOptions {
	/** 场景动画播完后的回调，默认接到 Map3D 的 UI 入场流程 */
	onPlayComplete?: () => void;
}

/**
 * 一个大屏 3D 场景需要暴露给 Map3D 的最小接口。
 * time 控制渲染循环，animateTl 是场景主时间轴，destroy 负责释放几何体、材质与监听。
 */
export interface MapWorld {
	time: Time;
	animateTl: gsap.core.Timeline;
	destroy: () => void;
}

/** world 类的构造签名，Map3D 用 new 动态实例化，避免底层依赖具体大屏实现 */
export type MapWorldConstructor = new (
	canvas: HTMLCanvasElement,
	assets: Assets,
	options?: MapWorldOptions,
) => MapWorld;

export interface Map3DOptions {
	/** Three.js 的渲染画布，尺寸由父节点 offsetWidth/offsetHeight 决定 */
	el: HTMLCanvasElement;
	/** 大屏根节点，用于查找 #loading、#header 等 DOM 做入场动画 */
	root: HTMLElement;
	/** 具体大屏的场景实现类 */
	world: MapWorldConstructor;
	/** 当前大屏的专属资源清单，会与通用贴图合并加载 */
	assets: ResourceAssets[];
}

/** 通用地图生命周期；页面、数据和场景编排由每个大屏自行实现。 */
export default class Map3D {
	private readonly _el: HTMLCanvasElement;
	/** 大屏根节点，所有 UI 入场动画的选择器都相对它查询 */
	private readonly _root: HTMLElement;
	private readonly _WorldClass: MapWorldConstructor;
	private readonly _assetManifest: ResourceAssets[];
	/** 资源加载器，initAssets 时创建，destroy 时置空 */
	private _assets?: Assets;
	/** 场景实例，资源加载完成（loadMap）后才存在 */
	private _world?: MapWorld;
	/** 销毁标记：异步回调与补间 onUpdate 都先判它，避免切屏后仍操作已卸载的 DOM */
	private _isDestroyed = false;
	/** UI 入场主时间轴，重复触发时先 kill 旧的一根 */
	private _uiTimeline: gsap.core.Timeline | null = null;
	/** loading 淡出时间轴，hideLoading 每次调用重建 */
	private _loadingTimeline: gsap.core.Timeline | null = null;
	/** 进度条数值补间，新的加载事件到来时先 kill 再补，防止多条并行动画抢同一个值 */
	private _progressTween: gsap.core.Tween | null = null;
	private _onAssetsProgress?: (
		path: string,
		itemsLoaded: number,
		itemsTotal: number,
	) => void;
	private _onAssetsLoad?: () => void;

	constructor(options: Map3DOptions) {
		this._el = options.el;
		this._root = options.root;
		this._WorldClass = options.world;
		this._assetManifest = options.assets;
	}

	/**
	 * 启动资源加载并订阅进度/完成事件。
	 * 加载完成后自动创建场景（loadMap），但此时不播放，等页面调用 play 再开始。
	 * @param onLoadCallback 全部资源就绪时触发，通常在里面 await hideLoading 再 play
	 * @param onProgressCallback 进度百分比（0~100 的整数），会按帧回调
	 */
	initAssets(
		onLoadCallback?: () => void,
		onProgressCallback?: (progress: number) => void,
	) {
		this._isDestroyed = false;
		// 用一个可变对象承载当前进度数值，交给 GSAP 补间驱动
		const params = { progress: 0 };
		this._assets = new Assets(this._assetManifest);
		this._onAssetsProgress = (_path, itemsLoaded, itemsTotal) => {
			if (this._isDestroyed || itemsTotal === 0) return;
			const progress = Math.floor((itemsLoaded / itemsTotal) * 100);
			this._progressTween?.kill();
			// 资源是并发加载的，进度会离散跳变（如 3/20 → 4/20）；
			// 用补间把数值平滑过渡到目标值，进度条才不会一格一格地跳。
			this._progressTween = gsap.to(params, {
				progress,
				onUpdate: () => {
					if (!this._isDestroyed) {
						onProgressCallback?.(Math.floor(params.progress));
					}
				},
			});
		};
		this._assets.instance.on("onProgress", this._onAssetsProgress);
		this._onAssetsLoad = () => {
			if (this._isDestroyed) return;
			this.loadMap();
			onLoadCallback?.();
		};
		this._assets.instance.on("onLoad", this._onAssetsLoad);
	}

	/**
	 * 销毁整条链路：停动画 → 停场景 → 解绑资源事件 → 释放加载器。
	 * 切屏时 Solid 的 onCleanup 会调用它，必须保证可重复调用（各字段判空）。
	 */
	destroy() {
		this._isDestroyed = true;
		this._uiTimeline?.kill();
		this._loadingTimeline?.kill();
		this._progressTween?.kill();
		this._uiTimeline = null;
		this._loadingTimeline = null;
		this._progressTween = null;
		// 场景内还存在入场、扩散、贴图等零散补间，切换大屏时统一停止。
		// 注意 clear() 是全局操作：会清空整个 gsap.globalTimeline（含其他模块注册的补间），
		// 这里依赖「同一时刻只挂载一块大屏」的前提；清理后这些补间不能再 play，只能重建。
		gsap.globalTimeline.clear();
		if (this._world) {
			this._world.destroy();
			this._world = undefined;
		}
		// 先解绑再销毁加载器，否则销毁后仍有在途请求回调，会对已清空的事件表 emit
		if (this._assets) {
			if (this._onAssetsProgress) {
				this._assets.instance.off("onProgress", this._onAssetsProgress);
			}
			if (this._onAssetsLoad) {
				this._assets.instance.off("onLoad", this._onAssetsLoad);
			}
			this._assets.instance.destroy();
			this._assets = undefined;
		}
		this._onAssetsProgress = undefined;
		this._onAssetsLoad = undefined;
	}

	/** 按选择器批量取出根节点下的 UI 元素，转成数组便于 GSAP 统一补间 */
	private _all(selector: string) {
		return Array.from(this._root.querySelectorAll<HTMLElement>(selector));
	}

	/**
	 * 地图场景播完后让各类 UI 面板入场。
	 * 三段错峰：顶部/底部框架先出（start），左右卡片随后（card 标签），
	 * 用相对时间轴末尾的负向偏移 "-=1" / "-=2" 让上下元素叠进同一时间段，避免逐块硬切。
	 */
	private handleMapPlayComplete() {
		if (this._isDestroyed) return;
		this._uiTimeline?.kill();
		const tl = gsap.timeline();
		this._uiTimeline = tl;
		const leftCards = this._all("#left-card");
		const rightCards = this._all("#right-card");
		const countCards = this._all("#count-card");
		tl.addLabel("start", 0.5);
		tl.addLabel("card", 1);
		// 初始状态由 CSS 给到 y 偏移 + opacity 0，这里只补间到最终位置
		tl.to(
			this._all("#header"),
			{
				y: 0,
				opacity: 1,
				duration: 1.5,
				ease: "power4.out",
			},
			"start",
		);
		tl.to(
			this._all("#bottom-tray"),
			{
				y: 0,
				opacity: 1,
				duration: 1.5,
				ease: "power4.out",
			},
			"start",
		);
		tl.to(
			this._all("#top-menu"),
			{
				y: 0,
				opacity: 1,
				duration: 1.5,
				ease: "power4.out",
			},
			"-=1",
		);
		tl.to(
			this._all("#bottom-radar"),
			{
				y: 0,
				opacity: 1,
				duration: 1.5,
				ease: "power4.out",
			},
			"-=2",
		);
		tl.to(
			leftCards,
			{
				x: 0,
				opacity: 1,
				stagger: 0.2,
				duration: 1.5,
				ease: "power4.out",
			},
			"card",
		);
		tl.to(
			rightCards,
			{
				x: 0,
				opacity: 1,
				stagger: 0.2,
				duration: 1.5,
				ease: "power4.out",
			},
			"card",
		);
		tl.to(
			countCards,
			{
				y: 0,
				opacity: 1,
				stagger: 0.2,
				duration: 1.5,
				ease: "power4.out",
			},
			"card",
		);
	}

	/**
	 * 资源就绪后实例化具体大屏的 world 场景。
	 * 创建完立刻 pause()，把首帧定格，等页面调用 play 再统一启动，保证入场动画从同一时刻开始。
	 */
	private loadMap() {
		if (!this._assets || this._isDestroyed) return;
		this._world = new this._WorldClass(this._el, this._assets, {
			onPlayComplete: () => this.handleMapPlayComplete(),
		});
		this._world.time.pause();
	}

	/**
	 * 启动场景播放：恢复逐帧循环，并把主时间轴速度归位后播放。
	 * 重复调用是幂等的，可用于从暂停态恢复。
	 */
	play() {
		if (this._isDestroyed) return;
		this._world?.time.resume();
		this._world?.animateTl.timeScale(1);
		this._world?.animateTl.play();
	}

	/**
	 * 播放 loading 层淡出动画，并在动画结束后 resolve。
	 * 调用方 await 之后再 play，可确保遮罩消失与场景启动的先后顺序。
	 */
	async hideLoading() {
		if (this._isDestroyed) return;
		const loading = this._root.querySelector<HTMLElement>("#loading");
		if (!loading) return;
		await new Promise<void>((resolve) => {
			this._loadingTimeline?.kill();
			const tl = gsap.timeline();
			this._loadingTimeline = tl;
			// 文案逐字上移淡出（stagger），"<" 表示与上一段同时开始
			tl.to(this._all("#loading-text span"), {
				y: "200%",
				opacity: 0,
				ease: "power4.inOut",
				duration: 2,
				stagger: 0.2,
			});
			tl.to(
				this._all("#loading-progress"),
				{
					opacity: 0,
					ease: "power4.inOut",
					duration: 2,
				},
				"<",
			);
			// 最后遮罩自身淡出，提前 1s 与文案重叠，避免出现纯黑的空档
			tl.to(
				loading,
				{
					opacity: 0,
					ease: "power4.inOut",
					onComplete: () => resolve(),
				},
				"-=1",
			);
		});
	}
}

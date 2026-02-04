import gsap from "gsap";
import emitter from "../utils/emitter";
import Assets from "./assets";
import World from "./world";

export interface Map3DOptions {
	el: HTMLCanvasElement;
}

export interface Statistical {
	icon: "xiaoshoujine" | "zongxiaoliang";
	zhLabel: string;
	enLabel: string;
	value: number;
	unit: string;
	decimals?: number;
}

export interface Map3DState {
	/** 进度 */
	progress: number;
	/** 顶部菜单激活索引 */
	activeIndex: string | number;
	/** 统计卡片 */
	statisticalCards: Statistical[];
}

export default class Map3D {
	private readonly _el: HTMLCanvasElement;
	/** 资源 */
	private _assets?: Assets;
	private _world?: World;

	constructor(options: Map3DOptions) {
		this._el = options.el;
	}

	get assets() {
		return this._assets;
	}

	/** 初始化加载资源 */
	initAssets(
		onLoadCallback?: () => void,
		onProgressCallback?: (progress: number) => void,
	) {
		emitter.$on("loadMap", () => this.loadMap());
		emitter.$on("mapPlayComplete", () => this.handleMapPlayComplete());
		const params = {
			progress: 0,
		};
		this._assets = new Assets();
		this._assets.instance.on("onProgress", (_path, itemsLoaded, itemsTotal) => {
			const p = Math.floor((itemsLoaded / itemsTotal) * 100);
			gsap.to(params, {
				progress: p,
				onUpdate: () => {
					onProgressCallback?.(Math.floor(params.progress));
				},
			});
		});
		// 资源加载完成
		this._assets.instance.on("onLoad", () => {
			// 加载地图
			emitter.$emit("loadMap", this._assets);
			onLoadCallback?.();
		});
	}

	/** 销毁 */
	destroy() {
		emitter.$off("loadMap", () => this.loadMap());
		emitter.$off("mapPlayComplete", () => this.handleMapPlayComplete());
	}

	/** 地图开始动画播放完成 */
	handleMapPlayComplete() {
		const tl = gsap.timeline({ paused: false });
		const leftCards = gsap.utils.toArray("#left-card");
		const rightCards = gsap.utils.toArray("#right-card");
		const countCards = gsap.utils.toArray("#count-card");
		tl.addLabel("start", 0.5);
		tl.addLabel("menu", 0.5);
		tl.addLabel("card", 1);
		tl.addLabel("countCard", 3);
		tl.to(
			"#header",
			{ y: 0, opacity: 1, duration: 1.5, ease: "power4.out" },
			"start",
		);
		tl.to(
			"#bottom-tray",
			{ y: 0, opacity: 1, duration: 1.5, ease: "power4.out" },
			"start",
		);
		tl.to(
			"#top-menu",
			{
				y: 0,
				opacity: 1,
				duration: 1.5,
				ease: "power4.out",
			},
			"-=1",
		);
		tl.to(
			"#bottom-radar",
			{ y: 0, opacity: 1, duration: 1.5, ease: "power4.out" },
			"-=2",
		);
		tl.to(
			leftCards,
			{ x: 0, opacity: 1, stagger: 0.2, duration: 1.5, ease: "power4.out" },
			"card",
		);
		tl.to(
			rightCards,
			{ x: 0, opacity: 1, stagger: 0.2, duration: 1.5, ease: "power4.out" },
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

	loadMap() {
		this._world = new World(this._el, this._assets);
		this._world?.time.pause();
	}

	/** 播放场景 */
	play() {
		this._world?.time.resume();
		this._world?.animateTl.timeScale(1);
		this._world?.animateTl.play();
	}

	/** 隐藏loading */
	async hideLoading() {
		return new Promise((resolve) => {
			const tl = gsap.timeline();
			tl.to("#loading-text span", {
				y: "200%",
				opacity: 0,
				ease: "power4.inOut",
				duration: 2,
				stagger: 0.2,
			});
			tl.to(
				"#loading-progress",
				{ opacity: 0, ease: "power4.inOut", duration: 2 },
				"<",
			);
			tl.to(
				"#loading",
				{
					opacity: 0,
					ease: "power4.inOut",
					onComplete: () => {
						resolve(0);
					},
				},
				"-=1",
			);
		});
	}
}

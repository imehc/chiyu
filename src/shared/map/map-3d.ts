import gsap from "gsap";
import Assets from "./assets";
import type { ResourceAssets } from "./utils/resource";
import type Time from "./utils/time";

export interface MapWorldOptions {
	onPlayComplete?: () => void;
}

export interface MapWorld {
	time: Time;
	animateTl: gsap.core.Timeline;
	destroy: () => void;
}

export type MapWorldConstructor = new (
	canvas: HTMLCanvasElement,
	assets: Assets,
	options?: MapWorldOptions,
) => MapWorld;

export interface Map3DOptions {
	el: HTMLCanvasElement;
	root: HTMLElement;
	world: MapWorldConstructor;
	assets: ResourceAssets[];
}

/** 通用地图生命周期；页面、数据和场景编排由每个大屏自行实现。 */
export default class Map3D {
	private readonly _el: HTMLCanvasElement;
	private readonly _root: HTMLElement;
	private readonly _WorldClass: MapWorldConstructor;
	private readonly _assetManifest: ResourceAssets[];
	private _assets?: Assets;
	private _world?: MapWorld;
	private _isDestroyed = false;
	private _uiTimeline: gsap.core.Timeline | null = null;
	private _loadingTimeline: gsap.core.Timeline | null = null;
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

	initAssets(
		onLoadCallback?: () => void,
		onProgressCallback?: (progress: number) => void,
	) {
		this._isDestroyed = false;
		const params = { progress: 0 };
		this._assets = new Assets(this._assetManifest);
		this._onAssetsProgress = (_path, itemsLoaded, itemsTotal) => {
			if (this._isDestroyed || itemsTotal === 0) return;
			const progress = Math.floor((itemsLoaded / itemsTotal) * 100);
			this._progressTween?.kill();
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

	destroy() {
		this._isDestroyed = true;
		this._uiTimeline?.kill();
		this._loadingTimeline?.kill();
		this._progressTween?.kill();
		this._uiTimeline = null;
		this._loadingTimeline = null;
		this._progressTween = null;
		// 场景内还存在入场、扩散、贴图等零散补间，切换大屏时统一停止。
		gsap.globalTimeline.clear();
		if (this._world) {
			this._world.destroy();
			this._world = undefined;
		}
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

	private _all(selector: string) {
		return Array.from(this._root.querySelectorAll<HTMLElement>(selector));
	}

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

	private loadMap() {
		if (!this._assets || this._isDestroyed) return;
		this._world = new this._WorldClass(this._el, this._assets, {
			onPlayComplete: () => this.handleMapPlayComplete(),
		});
		this._world.time.pause();
	}

	play() {
		if (this._isDestroyed) return;
		this._world?.time.resume();
		this._world?.animateTl.timeScale(1);
		this._world?.animateTl.play();
	}

	async hideLoading() {
		if (this._isDestroyed) return;
		const loading = this._root.querySelector<HTMLElement>("#loading");
		if (!loading) return;
		await new Promise<void>((resolve) => {
			this._loadingTimeline?.kill();
			const tl = gsap.timeline();
			this._loadingTimeline = tl;
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

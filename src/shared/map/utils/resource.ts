/**
 * 资源加载器：按声明清单并发加载贴图 / GLTF / GeoJSON，并广播进度与完成事件。
 * 由 Assets 包装后交给 Map3D，进度事件驱动 loading 进度条；场景层通过 getResource 取资源。
 * 事件名与参数见 event-emitter 的 EventMap。
 */
import {
	type FileLoader,
	Loader,
	LoadingManager,
	type Texture,
	TextureLoader,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
	type GLTF,
	GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import EventEmitter from "./event-emitter";

/** 加载器名 → 资源类型的映射，作为资源清单里 type 的合法取值表 */
const ResourceType = {
	GLTFLoader: "GLTF",
	TextureLoader: "Texture",
	FontLoader: "Font",
	MMDLoader: "MMD",
	MTLLoader: "MTL",
	OBJLoader: "OBJ",
	PCDLoader: "PCD",
	FileLoader: "File",
	ImageLoader: "Image",
	ObjectLoader: "Object",
	MaterialLoader: "Material",
	CubeTextureLoader: "CubeTexture",
	RGBELoader: "RGBELoader",
	FBXLoader: "FBX",
} as const;

type ResourceTypeKey = keyof typeof ResourceType;
type ResourceTypeSort = (typeof ResourceType)[ResourceTypeKey];
/** 清单中出现的一项资源：名称做索引，type 决定用哪个 loader，path 为构建后的 URL */
type LoadItemOption = {
	name: string;
	type: ResourceTypeSort;
	path: string;
};
/** 加载完成后的资源项，data 为 loader 返回的原始产物（贴图、GLTF 或纯文本） */
export type ResourceAssets = LoadItemOption & {
	data?: GLTF | Texture | ArrayBuffer | string | null;
};

/** 合法类型集合，用于校验清单里的 type 是否被支持 */
const types = Object.values(ResourceType);

interface ResourceOptions {
	/** Draco 解码器目录，默认走 public/draco/gltf/ */
	dracoPath?: string;
}

type DefaultLoader =
	| typeof GLTFLoader
	| typeof TextureLoader
	| typeof FileLoader;
type LoaderImpl = GLTFLoader | TextureLoader | FileLoader;

export default class Resource extends EventEmitter {
	private _dracoPath: string;
	private _itemsLoaded: number;
	private _itemsTotal: number;
	/** 已加载完成的资源项，getResource 从这里按 name 查找 */
	private _assets: ResourceAssets[];
	/** 已注册的 loader 实例，按资源类型索引，同类型复用同一个实例 */
	private _loaders: Record<ResourceTypeSort, LoaderImpl>;
	private _manager: LoadingManager;

	constructor({ dracoPath }: ResourceOptions = {}) {
		super();
		this._dracoPath = dracoPath || "/draco/gltf/";
		this._itemsLoaded = 0;
		this._itemsTotal = 0;
		this._assets = [];
		this._loaders = {} as Record<ResourceTypeSort, LoaderImpl>;
		this._manager = new LoadingManager();
		this.initDefaultLoader();
	}

	/**
	 * 创建一个挂好进度/错误回调的 LoadingManager。
	 * 注意：当前实现里默认 loaders 用的是构造函数的 _manager，本方法需外部显式使用才会生效，
	 * 实际进度以 loadItem 中逐项累加的计数为准。
	 */
	public initManager() {
		const manager = new LoadingManager();
		manager.onProgress = (url, itemsLoaded, itemsTotal) => {
			this._itemsLoaded = itemsLoaded;
			this._itemsTotal = itemsTotal;
			this.emit("onProgress", url, itemsLoaded, itemsTotal);
		};
		manager.onError = (err) => {
			this.emit("onError", err);
		};
		return manager;
	}

	/** 默认注册 GLTF 与 Texture 两类 loader；GeoJSON 的 FileLoader 由 Assets 额外补上 */
	private initDefaultLoader() {
		const loaders = [
			{ loader: GLTFLoader, name: "GLTFLoader" },
			{ loader: TextureLoader, name: "TextureLoader" },
		] as const;
		loaders.map((item) => this.addLoader(item.loader, item.name));
	}

	/**
	 * 注册一个 loader，重复注册同一类型会被忽略（复用首次创建的实例）。
	 * @param loader loader 构造函数，如 TextureLoader / FileLoader
	 * @param loaderName ResourceType 的键名，决定注册到哪个资源类型下
	 */
	addLoader(loader?: DefaultLoader, loaderName?: ResourceTypeKey) {
		if (!loader || !loaderName || !ResourceType[loaderName])
			throw new Error("请配置正确的加载器");
		const hasLoader = this._loaders[ResourceType[loaderName]];
		if (!hasLoader) {
			const instance = new loader(this._manager);
			const name = loaderName;
			if (instance instanceof Loader) {
				if (name === "GLTFLoader") {
					this.initDraco(instance as GLTFLoader);
				}
				this._loaders[ResourceType[name]] = instance;
			}
		}
	}

	/** 给 GLTFLoader 挂上 Draco 解码器，压缩过的模型才能正常解析 */
	private initDraco(loader: GLTFLoader) {
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath(this._dracoPath);
		dracoLoader.preload();
		loader.setDRACOLoader(dracoLoader);
	}

	/**
	 * 加载单项资源，成功后把 data 合并进资源项。
	 * 这里自行累加 _itemsLoaded 并广播进度，第二个参数（onProgress）故意置空，
	 * 避免与「以项为单位」的计数重复上报。
	 */
	loadItem(item: LoadItemOption): Promise<ResourceAssets> {
		return new Promise((resolve, reject) => {
			if (!this._loaders?.[item.type]) {
				throw new Error(`资源${item.path}没有配置加载器`);
			}
			this._loaders?.[item.type].load(
				item.path,
				(data) => {
					this._itemsLoaded++;
					this.emit(
						"onProgress",
						item.path,
						this._itemsLoaded,
						this._itemsTotal,
					);
					resolve({ ...item, data });
				},
				() => {},
				(err) => {
					this.emit("onError", err);
					reject(err);
				},
			);
		});
	}

	/**
	 * 加载整份清单：校验类型后并发请求，全部完成写入 _assets 并广播 onLoad。
	 * 任意一项失败即整体 reject，并广播 onError。
	 * @param assets 资源项数组，type 必须是 ResourceType 中的合法值
	 * @returns 加载完成后的资源项数组
	 */
	loadAll(assets: ResourceAssets[]) {
		this._itemsLoaded = 0;
		// 先清零总数，确保进度条从 0 开始而不是沿用上一轮的残留值
		this._itemsTotal = 0;
		return new Promise((resolve, reject) => {
			const currentAssets = this.matchType(assets);
			const promise: Promise<ResourceAssets>[] = [];
			this._itemsTotal = currentAssets.length;
			currentAssets.forEach((item) => {
				const currentItem = this.loadItem(item);
				promise.push(currentItem);
			});
			Promise.all(promise)
				.then((res) => {
					this._assets = res;
					this.emit("onLoad");
					resolve(res);
				})
				.catch((err) => {
					this.emit("onError", err);
					reject(err);
				});
		});
	}

	/**
	 * 校验并规范化资源清单，同时把 data 预置为 null（占位，加载完成后回填）。
	 * 类型非法的项会在 filter 回调里直接 throw，属于加载前的快速失败，
	 * 因此这类错误不会走 onError 事件。
	 */
	private matchType(assets: ResourceAssets[]) {
		this._assets = assets
			.map((item) => {
				const type = types.includes(item.type) ? item.type : "";
				return {
					type: type as ResourceTypeSort,
					path: item.path,
					name: item.name,
					data: null,
				};
			})
			.filter((item) => {
				if (!item.type) {
					throw new Error(`资源${item.path},type不正确`);
				}
				return item.type;
			});
		return this._assets;
	}

	/**
	 * 按名称取已加载的资源数据。
	 * 找不到直接抛错：场景元素强依赖贴图，早失败比渲染出空白更容易定位路径问题。
	 */
	getResource(name: string) {
		const current = this._assets.find((item) => {
			return item.name === name;
		});
		if (!current) {
			throw new Error(`资源${name}不存在`);
		}
		return current.data;
	}

	/** 销毁：解绑所有事件并清空资源引用，避免切换大屏后贴图被事件闭包长期持有 */
	destroy() {
		this.off("onProgress");
		this.off("onLoad");
		this.off("onError");
		this._assets = [];
	}
}

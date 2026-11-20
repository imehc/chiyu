/**
 * 地图资源清单：集中声明三块大屏共用的贴图，并与各屏自带的 GeoJSON 清单合并后统一加载。
 * 位于「Map3D 生命周期」第二步，由 map-3d.ts 构造，加载进度经 Resource 事件回传给进度条。
 */
import { FileLoader } from "three";
import arrow from "/texture/arrow.png";
import chinaBlurLine from "/texture/chinaBlurLine.png";
import mapFlyline from "/texture/flyline6.png";
import focusArrowsTexture from "/texture/focus/focus_arrows.png";
import focusBarTexture from "/texture/focus/focus_bar.png";
import focusBgTexture from "/texture/focus/focus_bg.png";
import focusMidQuanTexture from "/texture/focus/focus_mid_quan.png";
import focusMoveBgTexture from "/texture/focus/focus_move_bg.png";
import guangquan1 from "/texture/guangquan01.png";
import guangquan2 from "/texture/guangquan02.png";
import huiguang from "/texture/huiguang.png";
import ocean from "/texture/ocean-bg.png";
import pathLine3 from "/texture/pathLine2.png";
import point from "/texture/point1.png";
import rotationBorder1 from "/texture/rotationBorder1.png";
import rotationBorder2 from "/texture/rotationBorder2.png";
import side from "/texture/side.png";
import Resource, { type ResourceAssets } from "./utils/resource";

/**
 * 通用贴图清单，全部以 Texture 类型由 TextureLoader 预加载。
 * name 即场景里 getResource 的键名，改名会直接导致对应场景元素取不到贴图而抛错。
 */
const commonAssets: ResourceAssets[] = [
	{ type: "Texture", name: "pathLine3", path: pathLine3 },
	{ type: "Texture", name: "huiguang", path: huiguang },
	{ type: "Texture", name: "rotationBorder1", path: rotationBorder1 },
	{ type: "Texture", name: "rotationBorder2", path: rotationBorder2 },
	{ type: "Texture", name: "guangquan1", path: guangquan1 },
	{ type: "Texture", name: "guangquan2", path: guangquan2 },
	{ type: "Texture", name: "chinaBlurLine", path: chinaBlurLine },
	{ type: "Texture", name: "ocean", path: ocean },
	{ type: "Texture", name: "side", path: side },
	{ type: "Texture", name: "mapFlyline", path: mapFlyline },
	{ type: "Texture", name: "arrow", path: arrow },
	{ type: "Texture", name: "point", path: point },
	{ type: "Texture", name: "focusArrows", path: focusArrowsTexture },
	{ type: "Texture", name: "focusBar", path: focusBarTexture },
	{ type: "Texture", name: "focusBg", path: focusBgTexture },
	{ type: "Texture", name: "focusMidQuan", path: focusMidQuanTexture },
	{ type: "Texture", name: "focusMoveBg", path: focusMoveBgTexture },
];

/** 每个大屏只声明自己的地理数据，通用贴图由地图底层统一加载。 */
export default class Assets {
	/** 底层资源加载器，构造时即开始 loadAll，外部通过 instance 订阅进度与读取资源 */
	private readonly _instance: Resource;

	/**
	 * @param screenAssets 当前大屏专属资源（通常是 GeoJSON 与局部贴图），会追加在通用贴图之后
	 */
	constructor(screenAssets: ResourceAssets[]) {
		this._instance = new Resource();
		// GeoJSON 走 FileLoader 拿纯文本，再由 transfromMapGeoJSON 解析成 FeatureCollection
		this._instance.addLoader(FileLoader, "FileLoader");
		this._instance.loadAll([...commonAssets, ...screenAssets]);
	}

	/** 暴露给场景层读取贴图与监听加载事件的加载器实例 */
	get instance() {
		return this._instance;
	}
}

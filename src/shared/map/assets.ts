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
	private readonly _instance: Resource;

	constructor(screenAssets: ResourceAssets[]) {
		this._instance = new Resource();
		this._instance.addLoader(FileLoader, "FileLoader");
		this._instance.loadAll([...commonAssets, ...screenAssets]);
	}

	get instance() {
		return this._instance;
	}
}

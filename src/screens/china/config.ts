/**
 * 中国大屏的静态配置：地图资源清单与顶部统计卡片文案。
 * 资源条目交给 Map3D 的 initAssets 统一预加载，卡片数据在 index.tsx 顶部渲染，
 * 不涉及任何运行时状态。
 */
import type { Statistical } from "../../layouts/statistical-card";
import type { ResourceAssets } from "../../shared/map/utils/resource";

/**
 * 中国大屏需要预加载的 GeoJSON 资源。
 * name 是运行时取资源的键（world.ts 里通过 assets.instance.getResource 按名字取），
 * path 指向 public/geojson 下的静态文件。
 */
export const chinaAssets: ResourceAssets[] = [
	/** 周边国家陆地轮廓，用于中国地图外圈的背景底图。 */
	{ type: "File", name: "world", path: "/geojson/世界-周边.json" },
	{ type: "File", name: "mapJson", path: "/geojson/中华人民共和国.json" },
	{
		type: "File",
		name: "mapStroke",
		path: "/geojson/中华人民共和国-轮廓.json",
	},
];

export const chinaStatisticalCards: Statistical[] = [
	{
		icon: "xiaoshoujine",
		zhLabel: "省级区域覆盖",
		enLabel: "Provincial-level regions",
		value: 34,
		unit: "个",
	},
	{
		icon: "zongxiaoliang",
		zhLabel: "重点联动区域",
		enLabel: "Featured linked regions",
		value: 7,
		unit: "个",
	},
];

import type { Statistical } from "../../layouts/statistical-card";
import type { ResourceAssets } from "../../shared/map/utils/resource";

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

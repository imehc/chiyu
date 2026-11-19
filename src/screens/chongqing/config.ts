import type { Statistical } from "../../layouts/statistical-card";
import type { ResourceAssets } from "../../shared/map/utils/resource";

export const chongqingAssets: ResourceAssets[] = [
	{ type: "File", name: "china", path: "/geojson/中华人民共和国.json" },
	{ type: "File", name: "mapJson", path: "/geojson/重庆市.json" },
	{ type: "File", name: "mapStroke", path: "/geojson/重庆市-轮廓.json" },
];

export const chongqingStatisticalCards: Statistical[] = [
	{
		icon: "xiaoshoujine",
		zhLabel: "2024年生产总值",
		enLabel: "Gross Domestic Product in 2024",
		value: 32193,
		unit: "亿元",
	},
	{
		icon: "zongxiaoliang",
		zhLabel: "2024年常驻人数",
		enLabel: "resident population in 2024",
		value: 3190,
		unit: "万人",
	},
];

/**
 * 重庆市大屏的静态配置：GeoJSON 资源清单与顶部统计卡数据。
 * 由 ./index.tsx 引用——assets 交给 Map3D 统一加载，statisticalCards 渲染成顶部两张卡片。
 */
import type { Statistical } from "../../layouts/statistical-card";
import type { ResourceAssets } from "../../shared/map/utils/resource";

/**
 * 本屏专属资源清单，会与 shared/map 的通用贴图合并后一起加载。
 * 三项均为 File 类型（纯文本），加载结果是 GeoJSON 字符串，
 * 在 world.ts 中通过 getResource(name) 取出后直接传给 BaseMap / Line / ExtrudeMap。
 */
export const chongqingAssets: ResourceAssets[] = [
	// 全国行政区轮廓，作为重庆市外围的暗色底图
	{ type: "File", name: "china", path: "/geojson/中华人民共和国.json" },
	// 重庆市分区县边界，用于拉伸体地图与顶面
	{ type: "File", name: "mapJson", path: "/geojson/重庆市.json" },
	// 重庆市外轮廓，用于沿边界生成流光描边
	{ type: "File", name: "mapStroke", path: "/geojson/重庆市-轮廓.json" },
];

/**
 * 顶部统计卡数据，单位为卡片自身展示单位。
 * value 取 2024 年公开统计口径的近似值，仅作示例；icon 决定左侧图标样式。
 */
export const chongqingStatisticalCards: Statistical[] = [
	{
		icon: "xiaoshoujine",
		zhLabel: "2024年生产总值",
		enLabel: "Gross Domestic Product in 2024",
		// 单位：亿元
		value: 32193,
		unit: "亿元",
	},
	{
		icon: "zongxiaoliang",
		zhLabel: "2024年常驻人数",
		enLabel: "resident population in 2024",
		// 单位：万人
		value: 3190,
		unit: "万人",
	},
];

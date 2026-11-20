/**
 * 广东省大屏的静态配置：地图资源清单与顶部统计卡数据。
 * 由 index.tsx 消费——assets 交给 Map3D 预加载，统计卡数组直接渲染到屏幕顶部。
 */
import type { Statistical } from "../../layouts/statistical-card";
import type { ResourceAssets } from "../../shared/map/utils/resource";

/**
 * 地图资源清单，name 与 world.ts 中 getResource 的键一一对应：
 * - china：全国行政区底图，作为广东省之外的背景层；
 * - mapJson：广东省界，用于拉伸体、顶面与描边；
 * - mapStroke：广东省轮廓，单独加载以叠出流光边线。
 * 加载时会与 shared/map 内置的通用贴图（side、huiguang、point 等）合并。
 */
export const guangdongAssets: ResourceAssets[] = [
	{ type: "File", name: "china", path: "/geojson/中华人民共和国.json" },
	{ type: "File", name: "mapJson", path: "/geojson/广东省.json" },
	{ type: "File", name: "mapStroke", path: "/geojson/广东省-轮廓.json" },
];

/**
 * 顶部两张统计卡，均为示例数据，不代表真实统计口径。
 * value 与 unit 由 StatisticalCard 拼接展示，value 还会交给 StatisticalCount 做数字滚动；
 * 顺序即横向排列顺序，增删条目时布局会自动重新均分。
 */
export const guangdongStatisticalCards: Statistical[] = [
	{
		icon: "xiaoshoujine",
		zhLabel: "2024年生产总值",
		enLabel: "Gross Domestic Product in 2024",
		// 单位：亿元
		value: 31500,
		unit: "亿元",
	},
	{
		icon: "zongxiaoliang",
		zhLabel: "2024年常驻人数",
		enLabel: "resident population in 2024",
		// 单位：万人
		value: 15000,
		unit: "万人",
	},
];

export interface ChinaInfoPoint {
	name: string;
	level: string;
	value: number;
	lng: number;
	lat: number;
}

/**
 * 全国重点枢纽节点，演示数据。
 * 选点原则：
 * 1. 避开指标柱所在省份（广东、上海、四川、北京、新疆、黑龙江），防止图标压在光柱底座上；
 * 2. 卡片按 170×106 显示，面积较大，因此尽量落在西部与中部空旷区域，
 *    不要把节点放在上海、广东这类指标柱密集的东部沿海。
 */
const chinaInfoPoints: ChinaInfoPoint[] = [
	{
		name: "武汉枢纽",
		level: "优",
		value: 89.4,
		lng: 114.298572,
		lat: 30.584355,
	},
	{
		name: "西安枢纽",
		level: "优",
		value: 86.7,
		lng: 108.948024,
		lat: 34.263161,
	},
	{
		name: "重庆枢纽",
		level: "良",
		value: 84.1,
		lng: 106.504962,
		lat: 29.533155,
	},
	{
		name: "兰州枢纽",
		level: "良",
		value: 79.5,
		lng: 103.823557,
		lat: 36.058039,
	},
	{
		name: "南宁枢纽",
		level: "中",
		value: 74.8,
		lng: 108.320004,
		lat: 22.82402,
	},
	{
		name: "厦门枢纽",
		level: "中",
		value: 72.6,
		lng: 118.11022,
		lat: 24.490474,
	},
];

export default chinaInfoPoints;

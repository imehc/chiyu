import { type EChartsOption, graphic } from "echarts";
import { chinaTopRegions } from "../data/regions";

const axisText = { color: "#a9c8d8", fontSize: 10 };
const tooltip = {
	backgroundColor: "rgba(3, 20, 34, 0.95)",
	borderColor: "#278bad",
	textStyle: { color: "#fff", fontSize: 11 },
};

export const chinaLeftPanels: { title: string; option: EChartsOption }[] = [
	{
		title: "省级数据指数排行",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			grid: { left: 70, right: 28, top: 18, bottom: 20 },
			xAxis: {
				type: "value",
				max: 100,
				axisLabel: axisText,
				splitLine: { lineStyle: { color: "#285064", opacity: 0.35 } },
			},
			yAxis: {
				type: "category",
				inverse: true,
				data: chinaTopRegions.map((item) => item.name),
				axisLabel: { ...axisText, color: "#e4f8ff" },
				axisLine: { show: false },
				axisTick: { show: false },
			},
			series: [
				{
					type: "bar",
					data: chinaTopRegions.map((item) => item.value),
					barWidth: 8,
					label: {
						show: true,
						position: "right",
						color: "#7efbf6",
						fontSize: 10,
					},
					itemStyle: {
						borderRadius: 4,
						color: new graphic.LinearGradient(0, 0, 1, 0, [
							{ offset: 0, color: "#176b96" },
							{ offset: 1, color: "#55f4e4" },
						]),
					},
				},
			],
		},
	},
	{
		title: "区域协同趋势",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			legend: {
				top: 4,
				right: 12,
				textStyle: axisText,
				itemWidth: 12,
				itemHeight: 6,
			},
			grid: { left: 42, right: 20, top: 38, bottom: 26 },
			xAxis: {
				type: "category",
				data: ["2020", "2021", "2022", "2023", "2024"],
				axisLabel: axisText,
				axisLine: { lineStyle: { color: "#31566a" } },
			},
			yAxis: {
				type: "value",
				axisLabel: axisText,
				splitLine: { lineStyle: { color: "#285064", opacity: 0.35 } },
			},
			series: [
				{
					name: "东部",
					type: "line",
					smooth: true,
					data: [68, 73, 79, 86, 92],
					lineStyle: { color: "#55f4e4", width: 2 },
					itemStyle: { color: "#55f4e4" },
					areaStyle: { color: "rgba(85,244,228,0.10)" },
				},
				{
					name: "中西部",
					type: "line",
					smooth: true,
					data: [48, 55, 61, 70, 78],
					lineStyle: { color: "#5aa9ff", width: 2 },
					itemStyle: { color: "#5aa9ff" },
				},
			],
		},
	},
	{
		title: "重点产业分布",
		option: {
			tooltip: { ...tooltip, trigger: "item" },
			legend: { bottom: 4, textStyle: axisText, itemWidth: 10, itemHeight: 6 },
			series: [
				{
					type: "pie",
					radius: ["34%", "62%"],
					center: ["50%", "45%"],
					padAngle: 2,
					itemStyle: { borderRadius: 4 },
					label: { color: "#d8f6ff", fontSize: 10, formatter: "{b}" },
					data: [
						{ name: "数字产业", value: 34, itemStyle: { color: "#42e8d5" } },
						{ name: "先进制造", value: 28, itemStyle: { color: "#3c9ee8" } },
						{ name: "现代服务", value: 22, itemStyle: { color: "#756fe8" } },
						{ name: "绿色能源", value: 16, itemStyle: { color: "#e6c76a" } },
					],
				},
			],
		},
	},
	{
		title: "区域投资热度",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			grid: { left: 70, right: 28, top: 18, bottom: 20 },
			xAxis: {
				type: "value",
				max: 100,
				axisLabel: axisText,
				splitLine: { lineStyle: { color: "#285064", opacity: 0.35 } },
			},
			yAxis: {
				type: "category",
				inverse: true,
				data: ["成渝", "长江中游", "粤港澳", "长三角", "京津冀"],
				axisLabel: { ...axisText, color: "#e4f8ff" },
				axisLine: { show: false },
				axisTick: { show: false },
			},
			series: [
				{
					type: "bar",
					data: [76, 73, 91, 94, 82],
					barWidth: 8,
					label: {
						show: true,
						position: "right",
						color: "#e6c76a",
						fontSize: 10,
					},
					itemStyle: {
						borderRadius: 4,
						color: new graphic.LinearGradient(0, 0, 1, 0, [
							{ offset: 0, color: "#1d5c8a" },
							{ offset: 1, color: "#e6c76a" },
						]),
					},
				},
			],
		},
	},
];

export const chinaRightPanels: { title: string; option: EChartsOption }[] = [
	{
		title: "区域发展能力",
		option: {
			tooltip,
			radar: {
				center: ["50%", "54%"],
				radius: "62%",
				indicator: [
					{ name: "创新", max: 100 },
					{ name: "产业", max: 100 },
					{ name: "协同", max: 100 },
					{ name: "开放", max: 100 },
					{ name: "绿色", max: 100 },
				],
				axisName: { color: "#b7d9e7", fontSize: 10 },
				splitLine: { lineStyle: { color: "#31566a" } },
				splitArea: {
					areaStyle: { color: ["rgba(22,87,113,0.08)", "rgba(22,87,113,0.2)"] },
				},
			},
			series: [
				{
					type: "radar",
					data: [
						{
							name: "演示指数",
							value: [88, 82, 91, 79, 85],
							areaStyle: { color: "rgba(66,232,213,0.28)" },
							lineStyle: { color: "#55f4e4" },
							itemStyle: { color: "#55f4e4" },
						},
					],
				},
			],
		},
	},
	{
		title: "跨区域联动指数",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			grid: { left: 42, right: 20, top: 22, bottom: 28 },
			xAxis: {
				type: "category",
				data: ["京津冀", "长三角", "粤港澳", "成渝", "长江中游"],
				axisLabel: { ...axisText, interval: 0, fontSize: 9 },
				axisLine: { lineStyle: { color: "#31566a" } },
			},
			yAxis: {
				type: "value",
				max: 100,
				axisLabel: axisText,
				splitLine: { lineStyle: { color: "#285064", opacity: 0.35 } },
			},
			series: [
				{
					type: "bar",
					data: [82, 94, 91, 76, 73],
					barWidth: 16,
					itemStyle: {
						borderRadius: [3, 3, 0, 0],
						color: new graphic.LinearGradient(0, 0, 0, 1, [
							{ offset: 0, color: "#62dff5" },
							{ offset: 1, color: "#17547e" },
						]),
					},
				},
			],
		},
	},
	{
		title: "全国节点运行状态",
		option: {
			tooltip: { ...tooltip, trigger: "item" },
			series: [
				{
					type: "gauge",
					startAngle: 210,
					endAngle: -30,
					min: 0,
					max: 100,
					center: ["50%", "55%"],
					radius: "82%",
					progress: { show: true, width: 10, itemStyle: { color: "#48e5d1" } },
					axisLine: { lineStyle: { width: 10, color: [[1, "#173d52"]] } },
					axisTick: { show: false },
					splitLine: { show: false },
					axisLabel: { show: false },
					pointer: { show: false },
					anchor: { show: false },
					title: { offsetCenter: [0, "28%"], color: "#91b6c8", fontSize: 11 },
					detail: {
						valueAnimation: true,
						offsetCenter: [0, "-5%"],
						formatter: "{value}%",
						color: "#e5ffff",
						fontSize: 30,
					},
					data: [{ value: 86, name: "演示在线率" }],
				},
			],
		},
	},
	{
		title: "数据流量趋势",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			legend: {
				top: 4,
				right: 12,
				textStyle: axisText,
				itemWidth: 12,
				itemHeight: 6,
			},
			grid: { left: 42, right: 20, top: 38, bottom: 26 },
			xAxis: {
				type: "category",
				data: [
					"1月",
					"2月",
					"3月",
					"4月",
					"5月",
					"6月",
					"7月",
					"8月",
					"9月",
					"10月",
					"11月",
					"12月",
				],
				axisLabel: { ...axisText, interval: 1 },
				axisLine: { lineStyle: { color: "#31566a" } },
			},
			yAxis: {
				type: "value",
				axisLabel: axisText,
				splitLine: { lineStyle: { color: "#285064", opacity: 0.35 } },
			},
			series: [
				{
					name: "2023",
					type: "line",
					smooth: true,
					data: [42, 48, 55, 60, 58, 66, 72, 70, 78, 82, 85, 90],
					lineStyle: { color: "#5aa9ff", width: 2 },
					itemStyle: { color: "#5aa9ff" },
					areaStyle: { color: "rgba(90,169,255,0.10)" },
				},
				{
					name: "2024",
					type: "line",
					smooth: true,
					data: [50, 56, 62, 68, 72, 79, 85, 88, 92, 96, 98, 100],
					lineStyle: { color: "#55f4e4", width: 2 },
					itemStyle: { color: "#55f4e4" },
					areaStyle: { color: "rgba(85,244,228,0.10)" },
				},
			],
		},
	},
];

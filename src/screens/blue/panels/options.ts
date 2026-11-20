import { type EChartsOption, graphic } from "echarts";

const textColor = "#d4edf8";
const axis = {
	axisLine: { lineStyle: { color: "#173c52" } },
	axisTick: { show: false },
	axisLabel: { color: textColor, fontSize: 10, fontFamily: "D-DIN" },
};
const tooltip = {
	trigger: "axis" as const,
	backgroundColor: "rgba(2,24,42,.96)",
	borderColor: "#237aa5",
	textStyle: { color: "#d4f8ff", fontSize: 12 },
	axisPointer: { type: "line" as const, lineStyle: { color: "#4dc4e9" } },
};
const legend = {
	top: 7,
	right: 13,
	icon: "rect",
	itemWidth: 8,
	itemHeight: 3,
	itemGap: 10,
	textStyle: { color: "#91b8ce", fontSize: 10 },
};
const fade = (top: string, bottom = "rgba(11,54,85,.02)") =>
	new graphic.LinearGradient(0, 0, 0, 1, [
		{ offset: 0, color: top },
		{ offset: 1, color: bottom },
	]);

export const sales: EChartsOption = {
	animationDuration: 1400,
	tooltip,
	legend: { ...legend, data: ["数据一", "数据二", "数据三"] },
	grid: { top: 37, left: 50, right: 24, bottom: 30 },
	xAxis: {
		...axis,
		type: "category",
		data: [
			"03-24",
			"03-25",
			"03-26",
			"03-27",
			"03-28",
			"03-29",
			"03-30",
			"03-31",
		],
		axisLabel: { ...axis.axisLabel, interval: 0 },
	},
	yAxis: {
		...axis,
		type: "value",
		max: 250,
		interval: 50,
		name: "单位",
		nameTextStyle: { color: textColor, fontSize: 10 },
		splitLine: { lineStyle: { color: "#10304b", opacity: 0.4 } },
	},
	series: [
		{
			name: "数据一",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#f5d463", "#625224") },
			data: [120, 195, 154, 76, 78, 110, 126, 143],
		},
		{
			name: "数据二",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#16d6bd", "#074b54") },
			data: [181, 249, 165, 88, 102, 125, 140, 119],
		},
		{
			name: "数据三",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#39bfff", "#103456") },
			data: [101, 188, 170, 66, 92, 136, 155, 176],
		},
	],
};

export const economy: EChartsOption = {
	animationDuration: 1700,
	tooltip,
	legend: { ...legend, data: ["2022年", "2023年"] },
	grid: { top: 37, left: 54, right: 27, bottom: 29 },
	xAxis: {
		...axis,
		type: "category",
		boundaryGap: false,
		data: [
			"2022/04",
			"2022/05",
			"2022/06",
			"2022/07",
			"2022/08",
			"2022/09",
			"2022/10",
			"2022/11",
			"2022/12",
			"2023/01",
			"2023/02",
			"2024/02",
		],
		axisLabel: {
			...axis.axisLabel,
			interval: (index) => [0, 2, 4, 6, 8, 11].includes(index),
		},
	},
	yAxis: {
		...axis,
		type: "value",
		max: 1500,
		interval: 300,
		name: "单位",
		nameTextStyle: { color: textColor, fontSize: 10 },
		axisLine: { show: false },
		splitLine: { lineStyle: { color: "#0c2840", opacity: 0.28 } },
	},
	series: [
		{
			name: "2022年",
			type: "line",
			smooth: 0.55,
			symbol: "none",
			lineStyle: { color: "#81d8fb", width: 2 },
			itemStyle: { color: "#7edbfb" },
			areaStyle: {
				color: fade("rgba(52,132,184,.68)", "rgba(23,88,124,.12)"),
				opacity: 1,
			},
			data: [1200, 700, 500, 700, 1300, 650, 1250, 600, 1050, 450, 1000, 400],
		},
		{
			name: "2023年",
			type: "line",
			smooth: 0.55,
			symbol: "none",
			lineStyle: { color: "#31d3b7", width: 2 },
			itemStyle: { color: "#31d3b7" },
			areaStyle: {
				color: fade("rgba(36,205,162,.65)", "rgba(13,83,84,.08)"),
				opacity: 1,
			},
			data: [450, 950, 1100, 600, 400, 1000, 1200, 800, 1050, 650, 300, 150],
		},
	],
};

export const monthly: EChartsOption = {
	animationDuration: 1500,
	tooltip,
	legend: { ...legend, data: ["类型1", "类型2", "类型3"] },
	grid: { top: 36, left: 48, right: 25, bottom: 29 },
	xAxis: {
		...axis,
		type: "category",
		data: ["一月", "二月", "三月", "四月", "五月", "六月"],
		axisLabel: { ...axis.axisLabel, interval: 0 },
	},
	yAxis: {
		...axis,
		type: "value",
		max: 150,
		interval: 30,
		name: "单位",
		nameTextStyle: { color: textColor, fontSize: 10 },
		splitLine: { lineStyle: { color: "#15354c", opacity: 0.35 } },
	},
	series: [
		{
			name: "类型1",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#73e0cd", "#0d4354") },
			data: [100, 120, 130, 110, 120, 130],
		},
		{
			name: "类型2",
			type: "bar",
			barWidth: 5,
			itemStyle: { color: fade("#5ebcf7", "#16384b") },
			data: [62, 100, 150, 90, 140, 110],
		},
		{
			name: "类型3",
			type: "line",
			symbol: "circle",
			symbolSize: 3,
			lineStyle: { color: "#a6d8ff", width: 1.7 },
			itemStyle: { color: "#d2eeff" },
			data: [52, 15, 97, 32, 100, 69],
		},
	],
};

const globeDonut: EChartsOption = {
	animationDuration: 1500,
	tooltip: { ...tooltip, trigger: "item" },
	legend: {
		orient: "vertical",
		right: 25,
		top: 32,
		itemWidth: 7,
		itemHeight: 7,
		icon: "circle",
		itemGap: 23,
		textStyle: { color: "#e0f2ff", fontSize: 12 },
		formatter: (name) =>
			`${name}             ${[3254, 2145, 1278, 654][["数据一", "数据二", "数据三", "数据四"].indexOf(name)]} ↑`,
	},
	series: [
		{
			type: "pie",
			radius: ["46%", "55%"],
			center: ["22.1%", "48%"],
			startAngle: 70,
			label: { show: false },
			labelLine: { show: false },
			itemStyle: { borderWidth: 0 },
			emphasis: { scaleSize: 4 },
			data: [
				{ value: 3254, name: "数据一", itemStyle: { color: "#13adff" } },
				{ value: 2145, name: "数据二", itemStyle: { color: "#f9d04c" } },
				{ value: 1278, name: "数据三", itemStyle: { color: "#16d3b9" } },
				{ value: 654, name: "数据四", itemStyle: { color: "#1768d6" } },
			],
		},
	],
};

export function globeDonutOption(width: number, height: number): EChartsOption {
	const scale = Math.min(width / 380, height / 192);
	const x = width * 0.221;
	const y = height * 0.48;
	return {
		...globeDonut,
		graphic: [
			{
				type: "circle",
				shape: { cx: x, cy: y, r: 63 * scale },
				style: { fill: "none", stroke: "#08365c", lineWidth: 4 * scale },
			},
			{
				type: "circle",
				shape: { cx: x, cy: y, r: 39 * scale },
				style: { fill: "#061e36", stroke: "#1a608d", lineWidth: 3 * scale },
			},
			{
				type: "text",
				x,
				y: y - 6 * scale,
				style: {
					text: "7331",
					align: "center",
					verticalAlign: "middle",
					fill: "#e8faff",
					fontSize: 17 * scale,
					fontFamily: "D-DIN",
				},
			},
			{
				type: "text",
				x,
				y: y + 12 * scale,
				style: {
					text: "总计",
					align: "center",
					fill: "#e8faff",
					fontSize: 11 * scale,
				},
			},
		],
	};
}

export const pointedColumns: EChartsOption = {
	animationDuration: 1600,
	tooltip,
	grid: { top: 39, left: 47, right: 25, bottom: 28 },
	xAxis: {
		...axis,
		type: "category",
		data: [
			"03-24",
			"03-25",
			"03-26",
			"03-27",
			"03-28",
			"03-29",
			"03-30",
			"03-31",
		],
		axisLabel: { ...axis.axisLabel, interval: 0 },
	},
	yAxis: {
		...axis,
		type: "value",
		name: "单位",
		max: 100,
		interval: 20,
		nameTextStyle: { color: textColor, fontSize: 10 },
		splitLine: { lineStyle: { color: "#123047", opacity: 0.3 } },
	},
	series: [
		{
			type: "custom",
			name: "数据",
			encode: { x: 0, y: 1 },
			renderItem: (_params, api) => {
				const [x, top] = api.coord([api.value(0), api.value(1)]);
				const bottom = api.coord([api.value(0), 0])[1];
				const color = Number(api.value(0)) % 3 ? "#36dcc5" : "#46c9ff";
				return {
					type: "group",
					children: [
						{
							type: "path",
							shape: {
								pathData: `M${x - 9},${bottom} Q${x - 3},${bottom - 5} ${x - 1.5},${top + 5} L${x},${top} L${x + 1.5},${top + 5} Q${x + 3},${bottom - 5} ${x + 9},${bottom} Z`,
							},
							style: {
								fill: fade(color, "rgba(12,96,115,.08)"),
								shadowColor: color,
								shadowBlur: 6,
							},
						},
						{
							type: "circle",
							shape: { cx: x, cy: top, r: 2.3 },
							style: { fill: "#d3ffff", shadowBlur: 7, shadowColor: color },
						},
						{
							type: "text",
							x,
							y: top - 13,
							style: {
								text: String(api.value(1)),
								align: "center",
								fill: "#d4f8ff",
								fontSize: 10,
								fontFamily: "D-DIN",
							},
						},
					],
				};
			},
			data: [70, 47, 60, 84, 52, 63, 42, 63].map((value, index) => [
				index,
				value,
			]),
		},
	],
};

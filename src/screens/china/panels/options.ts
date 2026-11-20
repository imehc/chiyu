/**
 * 中国大屏左右侧栏的 ECharts 配置。
 * 与广东大屏不同，本屏图表不依赖公共 map 底层，配置完全独立维护：
 * 左侧四张偏榜单与趋势，右侧四张偏能力与运行状态。
 * 所有数据均为演示值，除「省级数据指数排行」复用 data/regions 外都写死在此文件。
 * 消费方：panels/index.tsx 按数组顺序渲染成 ChartPanel。
 */
import { type EChartsOption, graphic } from "echarts";
import { chinaTopRegions } from "../data/regions";

/** 所有坐标轴文字的统一样式，fontSize 10 是 1920 设计稿下的可读下限 */
const axisText = { color: "#a9c8d8", fontSize: 10 };
/** 统一的 tooltip 外观：深底 + 青色描边，保证浮层与面板底色有对比 */
const tooltip = {
	backgroundColor: "rgba(3, 20, 34, 0.95)",
	borderColor: "#278bad",
	textStyle: { color: "#fff", fontSize: 11 },
};

/** 左侧图表配置：标题与 option 成对出现，数组顺序即从上到下的展示顺序。 */
export const chinaLeftPanels: { title: string; option: EChartsOption }[] = [
	/**
	 * 横向条形图（排行）。
	 * 维度：7 个区域的指标值，单系列。
	 * yAxis 用 category 且 inverse 为 true，让数值最大的排在顶部；
	 * 条形用左深右浅的水平线性渐变，末端亮色呼应高数值。
	 */
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
				// 类目轴反向，data 无需事先倒序即可让首项显示在顶部
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
						// 0,0 → 1,0 表示从左到右的水平渐变
						color: new graphic.LinearGradient(0, 0, 1, 0, [
							{ offset: 0, color: "#176b96" },
							{ offset: 1, color: "#55f4e4" },
						]),
					},
				},
			],
		},
	},
	/**
	 * 双折线趋势图。
	 * 维度：5 个年度 × 2 个区域组（东部 / 中西部）。
	 * 只有东部系列带面积填充，用来强化「领先幅度」的视觉对比，避免两条填充互相压色。
	 */
	{
		title: "区域协同趋势",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			legend: {
				top: 4,
				right: 12,
				textStyle: axisText,
				// 图例色块压扁成细条，节省纵向空间
				itemWidth: 12,
				itemHeight: 6,
			},
			// top 38 给图例留位，避免图例与折线重叠
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
	/**
	 * 环形饼图（产业占比）。
	 * 维度：4 个产业分类，数值之和为 100%。
	 * radius 给成 [内径, 外径] 数组即环形；padAngle 让扇区之间留缝，
	 * 配合 borderRadius 形成「胶囊扇区」的观感。
	 */
	{
		title: "重点产业分布",
		option: {
			tooltip: { ...tooltip, trigger: "item" },
			legend: { bottom: 4, textStyle: axisText, itemWidth: 10, itemHeight: 6 },
			series: [
				{
					type: "pie",
					// 34% 内径留出中心空白，62% 外径避免贴边
					radius: ["34%", "62%"],
					center: ["50%", "45%"],
					padAngle: 2,
					itemStyle: { borderRadius: 4 },
					// {b} 是 ECharts 的类目名占位符，只显示名称不显示占比，避免四段文字挤在环外
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
	/**
	 * 横向条形图（区域热度）。
	 * 结构与第一张排行榜相同，但渐变换成蓝到金的暖色系，
	 * 与青色的排行榜形成区分，避免两张同构图表被误读成同一指标。
	 * 注意 yAxis 的 data 顺序与 series 的 data 必须逐项对应（成渝 → 京津冀）。
	 */
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

/** 右侧图表配置：先能力画像，再联动、运行状态与流量趋势。 */
export const chinaRightPanels: { title: string; option: EChartsOption }[] = [
	/**
	 * 雷达图（区域能力画像）。
	 * 维度：5 个固定指标，每个 max 都是 100，因此各轴刻度可直接横向比较。
	 * splitArea 用交替的两档透明度画同心环带，替代默认实心填充，观感更轻。
	 * 此图没有坐标轴，tooltip 不设 trigger（默认 item）。
	 */
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
					// 数组按环带顺序循环取色，两档交替即可
					areaStyle: { color: ["rgba(22,87,113,0.08)", "rgba(22,87,113,0.2)"] },
				},
			},
			series: [
				{
					type: "radar",
					data: [
						{
							name: "演示指数",
							// 顺序必须与 indicator 一一对应：创新、产业、协同、开放、绿色
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
	/**
	 * 纵向柱状图（联动指数）。
	 * 维度：5 个区域群 × 1 个指标。
	 * borderRadius 写成 [3,3,0,0]，即只圆化顶部两个角，柱底保持贴住轴线。
	 * axisLabel 里 interval: 0 强制显示每一个类目，否则 ECharts 会在窄宽度下自动隔项隐藏。
	 */
	{
		title: "跨区域联动指数",
		option: {
			tooltip: { ...tooltip, trigger: "axis" },
			grid: { left: 42, right: 20, top: 22, bottom: 28 },
			xAxis: {
				type: "category",
				data: ["京津冀", "长三角", "粤港澳", "成渝", "长江中游"],
				// 五个类目名较长，字号降到 9 并强制全显，靠缩小字号换取不换行
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
						// 0,0 → 0,1 是自上而下的垂直渐变，亮色在柱顶
						color: new graphic.LinearGradient(0, 0, 0, 1, [
							{ offset: 0, color: "#62dff5" },
							{ offset: 1, color: "#17547e" },
						]),
					},
				},
			],
		},
	},
	/**
	 * 仪表盘（在线率）。
	 * 只用 210°~-30° 的 240° 开口弧，留下方缺口放标题；
	 * pointer / anchor / axisTick / splitLine / axisLabel 全部关掉，
	 * 只保留进度条与中心数字，是「纯进度环」的最简写法。
	 * detail 的 valueAnimation 让数值在首次渲染时滚动到位。
	 */
	{
		title: "全国节点运行状态",
		option: {
			tooltip: { ...tooltip, trigger: "item" },
			series: [
				{
					type: "gauge",
					// 起始角在左下、终止角在右下，顺时针绘制 240°
					startAngle: 210,
					endAngle: -30,
					min: 0,
					max: 100,
					center: ["50%", "55%"],
					radius: "82%",
					progress: { show: true, width: 10, itemStyle: { color: "#48e5d1" } },
					// color 数组用 [[比例, 颜色]] 的断点写法，这里整条底轨一个颜色
					axisLine: { lineStyle: { width: 10, color: [[1, "#173d52"]] } },
					axisTick: { show: false },
					splitLine: { show: false },
					axisLabel: { show: false },
					pointer: { show: false },
					anchor: { show: false },
					// offsetCenter 的相对值以仪表盘半径为基准，0.28 即下移 28% 半径
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
	/**
	 * 双折线（月度流量）。
	 * 维度：12 个月 × 2 个年度，两条线都带淡面积填充。
	 * xAxis 的 interval: 1 表示隔一项显示，12 个中文月份只显示 6 个，防止标签挤在一起。
	 */
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

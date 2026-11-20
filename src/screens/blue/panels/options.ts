/**
 * 蓝色大屏图表面板的 ECharts option 工厂集合。
 * 上层 panels/index.tsx 直接把这些常量（或工厂函数）传给 panels/chart.tsx，
 * 由 chart.tsx 注入容器尺寸并套用 chart-theme.ts 的主题补丁后渲染。
 * 数据全部为演示用的静态数组，按「中国视图 / 全球视图」分两套，
 * 口径说明：柱状图与折线图的数值单位为「单位」（面板 y 轴 name 统一标注），
 * 环形图数值单位为「亿」；日期类目为 03-24 至 03-31 的八个点，
 * 经济图是 2022/04 起连续 12 个类目（末项标签为 2024/02）。
 */
import { type EChartsOption, graphic } from "echarts";

/** 坐标轴与文字的统一文字色，与面板背景形成足够对比但不压过数据色 */
const textColor = "#d4edf8";
/**
 * 坐标轴公共样式片段，被各 option 通过展开运算符复用。
 * axisTick 关闭是因为大屏缩放下小刻度会糊成一团，量级靠 splitLine 表达。
 */
const axis = {
	axisLine: { lineStyle: { color: "#173c52" } },
	axisTick: { show: false },
	axisLabel: { color: textColor, fontSize: 10, fontFamily: "D-DIN" },
};
/**
 * 提示框公共配置。
 * trigger: "axis" 表示按整条坐标轴触发（柱状/折线一起显示），
 * 环形图会覆盖成 "item"；axisPointer 用竖线跟随鼠标，便于对齐同一天的多个系列。
 */
const tooltip = {
	trigger: "axis" as const,
	backgroundColor: "rgba(2,24,42,.96)",
	borderColor: "#237aa5",
	textStyle: { color: "#d4f8ff", fontSize: 12 },
	axisPointer: { type: "line" as const, lineStyle: { color: "#4dc4e9" } },
};
/**
 * 图例公共配置：贴面板右上角，矩形小色块（8x3）比默认圆点更省纵向空间，
 * 每个 option 只需再补 data 里的系列名。
 */
const legend = {
	top: 7,
	right: 13,
	icon: "rect",
	itemWidth: 8,
	itemHeight: 3,
	itemGap: 10,
	textStyle: { color: "#91b8ce", fontSize: 10 },
};
/**
 * 纵向线性渐变的简写。
 * 坐标 (0,0) → (0,1) 是相对于图形包围盒的归一化坐标（非像素），
 * 因此同一函数可以同时用于柱体和面积填充，保证所有系列都是「上亮下暗」的同一光照方向。
 * @param top 渐变起点颜色（图形顶部）
 * @param bottom 渐变终点颜色，默认近乎透明的深蓝，让柱体底部融进背景
 */
const fade = (top: string, bottom = "rgba(11,54,85,.02)") =>
	new graphic.LinearGradient(0, 0, 0, 1, [
		{ offset: 0, color: top },
		{ offset: 1, color: bottom },
	]);

/**
 * 中国视图左列中段：3 月 24 日至 31 日三类数据的销售额对比图（分组柱状图）。
 * 图表类型：直角坐标系下的 bar；数据维度为 8 个日期 × 3 个系列、单指标。
 * 三个系列都没有设 stack，所以同一天的柱子是并排显示而不是堆叠；
 * y 轴上限定死 250 是为了让刻度台阶固定，切换数据时网格线不跳动。
 */
export const sales: EChartsOption = {
	animationDuration: 1400,
	tooltip,
	legend: { ...legend, data: ["数据一", "数据二", "数据三"] },
	// grid 四边留白单位是像素（相对画布），不是百分比：top 37 让出图例，left 50 容纳 y 轴名称与刻度，bottom 30 放下日期标签
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
		// max 与 interval 取整除关系（250 / 50），保证最后一条网格线正好落在顶部而不压到图例
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

/**
 * 中国视图右列中段：2022 年与 2023 年经济指标的双折线面积图。
 * 图表类型：直角坐标系下的 line + areaStyle；数据维度为 12 个月份 × 2 个年份系列。
 * 两条线不做叠加（无 stack），面积只是自身曲线到 0 轴的填充，
 * 因此交叉处会互相覆盖，靠后声明的系列（2023 年）压在 2022 年之上。
 */
export const economy: EChartsOption = {
	animationDuration: 1700,
	tooltip,
	legend: { ...legend, data: ["2022年", "2023年"] },
	grid: { top: 37, left: 54, right: 27, bottom: 29 },
	xAxis: {
		...axis,
		type: "category",
		// 关闭类目轴两侧留白，折线和面积填充才能贴住 y 轴，否则左右各空半格
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
			// 12 个类目全量显示会互相压字，用回调只保留第 0/2/4/6/8/11 个，
			// 末位 11 是刻意保留的，确保最后一个月一定有可读标签
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
			// 0.55 是贝塞尔张力（0 为折线、1 最圆滑），保留月度拐点又不显得生硬
			smooth: 0.55,
			// 隐藏数据点符号，12 个点在大屏上会变成一串杂点，数值改由 tooltip 给出
			symbol: "none",
			lineStyle: { color: "#81d8fb", width: 2 },
			itemStyle: { color: "#7edbfb" },
			// areaStyle 的渐变本身带透明度，所以 opacity 保持 1，避免再乘一次导致面积过淡
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

/**
 * 中国视图右列末段：各月份分类数据的柱线混合图。
 * 图表类型：两个 bar 系列 + 一个 line 系列，共用同一个直角坐标系（grid 索引 0）。
 * 数据维度：6 个月 × 3 个分类，其中「类型3」用折线表达趋势，与前两个柱系列叠加对比而非堆叠。
 */
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
			// 折线保留 3px 小圆点，混合图里柱体较多，需要靠点标记折线的落点位置
			symbol: "circle",
			symbolSize: 3,
			lineStyle: { color: "#a6d8ff", width: 1.7 },
			itemStyle: { color: "#d2eeff" },
			data: [52, 15, 97, 32, 100, 69],
		},
	],
};

/**
 * 全球视图左列顶部的占比环形图（ECharts 版，区别于 donut.tsx 的手绘立体版）。
 * 图表类型：pie，通过内外半径形成圆环；数据维度为 4 个分类，单位为「亿」，合计 7331。
 * 半径为百分比，基准是容器宽高较小值的一半；center 用 22.1% / 48% 靠左偏上，
 * 右侧留给纵向图例，这个百分比同时被 globeDonutOption 里的 graphic 装饰引用，二者必须保持一致。
 */
const globeDonut: EChartsOption = {
	animationDuration: 1500,
	// 饼图按单个扇区触发提示，不能沿用公共配置里的 axis 触发方式
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
		// 图例文案用名称反查索引再取对应数值拼接，末尾箭头表示同比上升；
		// 名称必须与 data 中的 name 完全一致，否则 indexOf 返回 -1 会取到 undefined
		formatter: (name) =>
			`${name}             ${[3254, 2145, 1278, 654][["数据一", "数据二", "数据三", "数据四"].indexOf(name)]} ↑`,
	},
	series: [
		{
			type: "pie",
			// 内外半径写成百分比，环宽就是两者之差；环本身不透明，靠 graphic 在下方补底盘
			radius: ["46%", "55%"],
			center: ["22.1%", "48%"],
			// 起始角 70° 让第一个扇区落在右上方，避免扇区被右侧图例遮住
			startAngle: 70,
			label: { show: false },
			labelLine: { show: false },
			itemStyle: { borderWidth: 0 },
			// 悬停时扇区沿半径方向外扩 4px，形成轻微的「被顶起」反馈
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

/**
 * 按容器尺寸生成全球视图环形图的完整 option：在静态配置外补一层 graphic 装饰。
 * 之所以做成工厂函数：环形图需要圈环、底盘和中心总计文案，这些不是 series 能力范围内的事，
 * 只能用 graphic 画，而 graphic 使用绝对像素坐标，必须拿到实时画布宽高才能缩放与居中。
 * @param width 画布宽度（像素），由 Chart 容器在 layout 后测得
 * @param height 画布高度（像素）
 * @returns 装饰元素随容器等比缩放的 option
 */
export function globeDonutOption(width: number, height: number): EChartsOption {
	// 以 380x192 为设计稿基准取最小缩放比，保证窄容器下装饰不会超出画布
	const scale = Math.min(width / 380, height / 192);
	// 与 series.center 的百分比保持同一基准，把环形图圆心折算成 graphic 需要的像素坐标
	const x = width * 0.221;
	const y = height * 0.48;
	return {
		...globeDonut,
		// graphic 是不参与数据映射的静态图元，按数组顺序绘制：
		// 外描边圆环 → 深色内盘 → 中心数值 → 单位说明文字
		graphic: [
			{
				type: "circle",
				// 外圈 63 与内盘 39 之间的缝隙正好露出下方的 pie 环，视觉上像环嵌在底座里
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
					// 7331 是四个扇区数值之和，与 legend formatter 里的数字同源，改数据时必须同步
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

/**
 * 全球视图左列中段：3 月 24 日至 31 日的每日数据走势（尖顶光柱图）。
 * 图表类型：custom（自定义系列）叠在直角坐标系上，用 renderItem 手绘图形；
 * 数据维度为 8 个日期 × 1 个指标。之所以不用原生 bar，是因为需要「底座收窄 + 顶点光点 + 顶部数值」
 * 三层组合，原生柱状图无法一次表达。
 */
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
			// encode 声明 data 每一维的用途：第 0 维给 x（类目序号）、第 1 维给 y（数值），
			// 这样 tooltip 与坐标轴换算都能直接复用
			encode: { x: 0, y: 1 },
			renderItem: (_params, api) => {
				// api.coord 把「类目序号 + 数值」换算成画布像素坐标，返回 [x, y]
				const [x, top] = api.coord([api.value(0), api.value(1)]);
				// 以数值 0 的像素高度作为柱底，保证所有柱子站在同一条基线
				const bottom = api.coord([api.value(0), 0])[1];
				// 每三根换一次色，用序号取模形成冷暖交替的节奏
				const color = Number(api.value(0)) % 3 ? "#36dcc5" : "#46c9ff";
				return {
					type: "group",
					children: [
						{
							type: "path",
							shape: {
								// 从柱底左右各 9px 处用二次贝塞尔收到顶点，形成箭矢状的尖顶柱
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
							// 顶点光点用同色 shadowBlur 做辉光，二者是同一根柱子的视觉延伸
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
				// custom 系列的 data 需要带 x 维度，这里用类目序号代替日期字符串
				index,
				value,
			]),
		},
	],
};

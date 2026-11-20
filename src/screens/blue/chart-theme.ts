/**
 * 蓝色大屏的 ECharts 主题补丁。
 * 以「不改动业务 option」为前提，只统一坐标轴、图例、提示框与动画参数，
 * 让左右面板里各张图表在配色、字号与缓动上保持一致。
 * 由 panels/ 下的图表组件在 setOption 前调用。
 */
import type {
	EChartsOption,
	LegendComponentOption,
	TooltipComponentOption,
	XAxisComponentOption,
	YAxisComponentOption,
} from "echarts";

/** 次级文字色：偏冷的浅蓝，保证在深色面板上对比度足够但不抢主数据 */
const labelColor = "#c1dfed";
/** 数字与文案字体栈：D-DIN 提供等宽数字，回退到阿里普惠体与系统无衬线 */
const numberFont = '"D-DIN", "Alibaba PuHuiTi", sans-serif';

/**
 * 把主题函数应用到「单个组件或组件数组」上。
 * ECharts 的 axis / legend / tooltip 都允许数组形式（多轴、多图例），这里统一摊平处理。
 */
function mapComponent<T>(
	component: T | T[] | undefined,
	transform: (component: T) => T,
): T | T[] | undefined {
	if (Array.isArray(component)) return component.map(transform);
	return component === undefined ? undefined : transform(component);
}

/**
 * 统一 X/Y 轴样式。
 * 保留调用方已有的配置（展开顺序在前），只覆盖颜色、字号与分割线默认值。
 */
function themeAxis<T extends XAxisComponentOption | YAxisComponentOption>(
	axis: T,
): T {
	return {
		...axis,
		axisLine: {
			...axis.axisLine,
			lineStyle: {
				...axis.axisLine?.lineStyle,
				color: "#235d7d",
				opacity: 0.65,
			},
		},
		// 默认隐藏刻度小线段，靠分割线表达量级，减少面板内的视觉噪音
		axisTick: { show: false, ...axis.axisTick },
		axisLabel: {
			...axis.axisLabel,
			color: labelColor,
			// 10px 是大屏远距离可读的下限，调用方显式指定时不覆盖
			fontSize: axis.axisLabel?.fontSize ?? 10,
			fontFamily: numberFont,
		},
		nameTextStyle: {
			...axis.nameTextStyle,
			color: labelColor,
			fontSize: axis.nameTextStyle?.fontSize ?? 10,
		},
		splitLine: {
			...axis.splitLine,
			// 数值轴默认显示网格线，类目轴默认不显示，避免柱状图被竖线切碎
			show: axis.splitLine?.show ?? axis.type === "value",
			lineStyle: {
				...axis.splitLine?.lineStyle,
				color: "#245779",
				opacity: 0.3,
				type: "dotted",
			},
		},
	};
}

/** 图例文字统一为主题色与数字字体，位置与形状仍由调用方决定 */
function themeLegend(legend: LegendComponentOption): LegendComponentOption {
	return {
		...legend,
		textStyle: {
			...legend.textStyle,
			color: labelColor,
			fontFamily: numberFont,
		},
	};
}

/**
 * 提示框样式。
 * @param reducedMotion 用户偏好减少动态效果时为 true，此时禁用提示框过渡
 */
function themeTooltip(
	tooltip: TooltipComponentOption,
	reducedMotion: boolean,
): TooltipComponentOption {
	return {
		...tooltip,
		// confine 防止提示框溢出画布被裁切，大屏容器普遍 overflow:hidden
		confine: true,
		backgroundColor: "rgba(3, 25, 46, .94)",
		borderColor: "#338fc1",
		borderWidth: 1,
		padding: [8, 10],
		transitionDuration: reducedMotion ? 0 : 0.16,
		// 毛玻璃与辉光通过 extraCssText 注入，ECharts 没有对应配置项
		extraCssText: `${tooltip.extraCssText ?? ""};box-shadow:0 0 16px #1499cf22;backdrop-filter:blur(8px);`,
		textStyle: {
			...tooltip.textStyle,
			color: "#e4f7ff",
			fontSize: tooltip.textStyle?.fontSize ?? 12,
			fontFamily: numberFont,
		},
		axisPointer: {
			...tooltip.axisPointer,
			lineStyle: {
				...tooltip.axisPointer?.lineStyle,
				color: "#66d4f4",
				width: 1,
				type: "dashed",
			},
		},
	};
}

/**
 * 应用大屏主题，返回新的 option（不修改入参）。
 * series、渐变、graphic 与图表几何全部原样透传，保证主题只影响「外壳」。
 * @param option 业务图表配置
 * @param reducedMotion 是否遵循系统的减少动效偏好；为 true 时动画时长与延迟归零
 */
export function applyBlueChartTheme(
	option: EChartsOption,
	reducedMotion: boolean,
): EChartsOption {
	const duration = option.animationDuration;
	return {
		...option,
		backgroundColor: option.backgroundColor ?? "transparent",
		// 先铺主题字体色，再让业务 textStyle 覆盖，避免主题压掉局部样式
		textStyle: {
			color: labelColor,
			fontFamily: numberFont,
			...option.textStyle,
		},
		animation: !reducedMotion && option.animation !== false,
		// 首屏动画封顶 900ms：面板较多时避免入场拖沓遮挡数据
		animationDuration: reducedMotion
			? 0
			: typeof duration === "number"
				? Math.min(duration, 900)
				: (duration ?? 900),
		animationDurationUpdate: reducedMotion
			? 0
			: (option.animationDurationUpdate ?? 220),
		animationEasing: option.animationEasing ?? "cubicOut",
		animationEasingUpdate: option.animationEasingUpdate ?? "cubicOut",
		// 按系列索引错峰入场，单项延迟上限 120ms，避免柱数多时尾部过晚出现
		animationDelay: reducedMotion
			? 0
			: (option.animationDelay ?? ((index) => Math.min(index * 24, 120))),
		xAxis: mapComponent(option.xAxis, themeAxis),
		yAxis: mapComponent(option.yAxis, themeAxis),
		legend: mapComponent(option.legend, themeLegend),
		tooltip: mapComponent(option.tooltip, (tooltip) =>
			themeTooltip(tooltip, reducedMotion),
		),
	};
}

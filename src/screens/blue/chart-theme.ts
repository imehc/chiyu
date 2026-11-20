import type {
	EChartsOption,
	LegendComponentOption,
	TooltipComponentOption,
	XAxisComponentOption,
	YAxisComponentOption,
} from "echarts";

const labelColor = "#c1dfed";
const numberFont = '"D-DIN", "Alibaba PuHuiTi", sans-serif';

function mapComponent<T>(
	component: T | T[] | undefined,
	transform: (component: T) => T,
): T | T[] | undefined {
	if (Array.isArray(component)) return component.map(transform);
	return component === undefined ? undefined : transform(component);
}

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
		axisTick: { show: false, ...axis.axisTick },
		axisLabel: {
			...axis.axisLabel,
			color: labelColor,
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

function themeTooltip(
	tooltip: TooltipComponentOption,
	reducedMotion: boolean,
): TooltipComponentOption {
	return {
		...tooltip,
		confine: true,
		backgroundColor: "rgba(3, 25, 46, .94)",
		borderColor: "#338fc1",
		borderWidth: 1,
		padding: [8, 10],
		transitionDuration: reducedMotion ? 0 : 0.16,
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

/** Keep the existing series, gradients, graphic objects and chart geometry. */
export function applyBlueChartTheme(
	option: EChartsOption,
	reducedMotion: boolean,
): EChartsOption {
	const duration = option.animationDuration;
	return {
		...option,
		backgroundColor: option.backgroundColor ?? "transparent",
		textStyle: {
			color: labelColor,
			fontFamily: numberFont,
			...option.textStyle,
		},
		animation: !reducedMotion && option.animation !== false,
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

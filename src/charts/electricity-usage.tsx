/**
 * 用电情况折线图（ECharts 折线 + 渐变面积）：两条同比曲线各自叠一层加粗的暗色底线，
 * 合成为「外发光、内实心」的双层效果。被重庆 / 广东大屏右栏「用电情况」卡片引用，
 * 数据为 2023/04–2024/03 的示例值，单位万度（title 标注），量级 200~1300。
 */
import { type ECharts, type EChartsOption, graphic, init } from "echarts";
import { onCleanup, onMount } from "solid-js";
import Card from "../componnets/card";

/**
 * 用电情况图表组件，不接收 props：数据与配色写死在 option 里，属静态展示卡片。
 * 生命周期：onMount 中 init 并 setOption（只调用一次，没有响应式数据驱动更新），
 * 同时用 ResizeObserver 跟随容器变化 resize；onCleanup 中先断观察再 dispose 实例。
 */
export default function ElectricityUsage() {
	let chartRef: HTMLDivElement | undefined;
	let chartInstance: ECharts | null = null;

	/**
	 * 完整配置对象。整体走「深色底 + 细虚线网格 + 发光折线」的大屏风格，
	 * 左侧留 12%、上方留 25% 是为了给图例、单位标题腾出空间，避免压到绘图区。
	 */
	const option = {
		// 左上角的单位标注，不是真正的标题，所以字号压到 8px
		title: {
			text: "万度",
			left: "5%",
			top: "8%",
			textStyle: {
				color: "#D3F8F2",
				fontSize: 8,
			},
		},
		// 百分比相对整个图表容器（canvas）宽高计算，left 12% + width 82% = 94%，右侧留 6% 防末端标签被裁
		grid: {
			left: "12%",
			top: "25%",
			width: "82%",
			height: "55%",
		},
		// 图例只做年份颜色对照：四条系列两两同名，legend 按名称合并成两个色块
		legend: {
			top: "4%",
			icon: "circle",
			itemWidth: 8,
			itemHeight: 8,
			textStyle: {
				color: "#90979c",
				fontSize: 12,
				lineHeight: 20,
			},
			data: ["2022年", "2023年"],
		},

		// 按坐标轴触发，用半透明阴影柱指示当前月份，便于逐月比对两条线
		tooltip: {
			trigger: "axis",
			axisPointer: {
				type: "shadow",
				shadowStyle: { opacity: 0.2 },
			},
			backgroundColor: "rgba(0,0,0,1)",
			borderWidth: 1,
			borderColor: "#999999",
			textStyle: {
				color: "#ffffff",
				fontSize: 10,
				// 156 与 10px 字号明显不成比例，单行提示框也会按此撑高，等于刻意留白；
				// purpose-special-funds.tsx 用的是同一取值，改动会影响两处观感
				lineHeight: 156,
			},
		},
		// 图例色（青 / 绿），系列自身的 lineStyle 又用渐变覆盖，这里主要作用于 legend 与 tooltip 色点
		color: ["#6BC7F6", "#44E6A2"],
		xAxis: [
			{
				type: "category",

				axisLine: {
					show: false,
					lineStyle: {
						color: "#435459",
					},
				},
				axisTick: {
					show: false,
				},
				splitLine: {
					show: false,
				},
				axisLabel: {
					color: "#ffffff",
					fontSize: 10,
					// interval 1 = 隔一个显示一个，12 个月只露 6 个标签，窄卡片里才不会糊成一片
					interval: 1,
					padding: [0, 0, 0, 0],
				},
				// 同比口径：跨 2023/04 到 2024/03 共 12 个月
				data: [
					"2023/04",
					"2023/05",
					"2023/06",
					"2023/07",
					"2023/08",
					"2023/09",
					"2023/10",
					"2023/11",
					"2023/12",
					"2024/01",
					"2024/02",
					"2024/03",
				],
			},
			// 影子 x 轴：不给 data、不画轴线，只用来挂载「第二层」同名曲线。
			// 它与第一根轴共享同一个 grid，类目由 series 数据长度自动补齐（同为 12 个点），
			// 因此两层曲线能像素级重合；上下叠放顺序则由各 series 的 z 值决定（3 在上、0 在下）。
			{
				axisLine: {
					show: false,
					lineStyle: {
						color: "rgba(0,0,0,0)",
					},
				},
				data: [],
			},
		],
		// 数值轴不画轴线与刻度，只用 2-2 的极细虚线当水平参考线，避免网格抢过折线
		yAxis: {
			type: "value",

			axisLine: {
				show: false,
			},
			axisTick: {
				show: false,
			},
			splitLine: {
				show: true,
				lineStyle: {
					// type [2,2] 是「实 2px、空 2px」，dashOffset 5 让虚线段错开，看起来更均匀
					type: [2, 2],
					dashOffset: 5,
					color: ["rgba(255, 255, 255, 1)"],
					opacity: 1,
					// 线宽压到 0.3，白色在这种极细线条上呈现为半透明的灰白
					width: 0.3,
				},
			},
			axisLabel: {
				color: "#8B9EA4",
				fontSize: 9,
			},
		},
		series: [
			// 第 1 层：2022 年的「亮线」，z 值 3 保证画在最上层，线宽 1 + 蓝色阴影模拟发光
			{
				name: "2022年",
				data: [1200, 700, 500, 700, 1300, 500, 200, 500, 1200, 700, 400, 1100],
				type: "line",
				// smooth 开启贝塞尔平滑，月度用电量波动适合用曲线弱化锯齿，但会略微夸大局部极值
				smooth: true,
				// symbol 是内联的 base64 光点图（20×20），配合 symbolSize 10 缩到一半显示
				symbol:
					"image://data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAQ5JREFUOE+1la1OQ0EQRs8kCFIQdVCCxIBpCK1AInkDHC+B4QkwvASub4GsaE0NGCRpKhGFVDQZ+Mjem9vNbkphmWTMfjNnd3b2x0iYuxuwH7wNbIewBfAGzORm5nG6ElfM3QU6AXZSkzXG3oEnMxO8thWgux8DR2tAsfxiZs/VYA38Jazi1NBvYCizv+HK4vCRyrfQgIsf7Nm6+bSnjwIeAGeZaGnXQDfoE+ABmGbixwKeAoeJAMHuv3w30ubATQb6KqDKjZPEuAXOMysZAncJbS7gJbCVEAdAKwP8AK4S2vJfgMVLLt6UDtAreWx0W8od7OJXryq16OPwR2j6+WpAyz2wDagape7vARt9AZ+G3HmhiKS3xwAAAABJRU5ErkJggg==",
				symbolSize: 10,
				showSymbol: false, // 是否显示 symbol, 如果 false 则只有在 tooltip hover 的时候显示。
				// 挂到影子轴上：与粗底线分层，靠 z 决定谁在上
				xAxisIndex: 1,
				z: 3,
				// 设置高亮样式
				emphasis: {
					focus: "none",
					itemStyle: { color: "white" },
				},
				// 12 个点全部打出数值：position top + distance 10 让标签浮在点上方，
				// 字号压到 8 是为了两条线同月数值紧挨时还能塞下
				label: {
					show: true,
					position: "top",
					distance: 10,
					color: "#ffffff",
					fontSize: 8,
				},

				// 阴影不偏移只做泛光（blur 20），营造霓虹感；实际画出来的是 1px 细线
				lineStyle: {
					shadowColor: "rgba(115, 208, 255, 1)",
					shadowBlur: 20,
					shadowOffsetY: 0,
					width: 1,
					// LinearGradient(0,0,0,1)：起点取图形包围盒左上、终点取左下，即自上而下的竖向渐变，
					// 高位亮蓝、低位压到深蓝，让线条在深色底上有沉下去的体积感
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(115, 208, 255, 1)",
						},
						{
							offset: 1,
							color: "rgba(18,60,98,1)",
						},
					]),
				},
			},
			{
				name: "2023年",
				data: [500, 900, 1100, 600, 400, 600, 1300, 900, 700, 1000, 500, 300],
				type: "line",
				smooth: true,
				symbol:
					"image://data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAQ5JREFUOE+1la1OQ0EQRs8kCFIQdVCCxIBpCK1AInkDHC+B4QkwvASub4GsaE0NGCRpKhGFVDQZ+Mjem9vNbkphmWTMfjNnd3b2x0iYuxuwH7wNbIewBfAGzORm5nG6ElfM3QU6AXZSkzXG3oEnMxO8thWgux8DR2tAsfxiZs/VYA38Jazi1NBvYCizv+HK4vCRyrfQgIsf7Nm6+bSnjwIeAGeZaGnXQDfoE+ABmGbixwKeAoeJAMHuv3w30ubATQb6KqDKjZPEuAXOMysZAncJbS7gJbCVEAdAKwP8AK4S2vJfgMVLLt6UDtAreWx0W8od7OJXryq16OPwR2j6+WpAyz2wDagape7vARt9AZ+G3HmhiKS3xwAAAABJRU5ErkJggg==",
				symbolSize: 10,
				showSymbol: false, // 是否显示 symbol, 如果 false 则只有在 tooltip hover 的时候显示。
				// 第 2 层：2023 年的亮线，另外带一块面积渐变（areaStyle），是四条里唯一有填充的；
				// 顶部青色 0.4 透明度向下衰减到全透明，让折线下方柔和收边而不是硬切一条边
				xAxisIndex: 1,
				z: 0,
				// 设置高亮样式
				emphasis: {
					focus: "none",
					itemStyle: { color: "white" },
				},
				label: {
					show: true,
					position: "top",
					distance: 10,
					color: "#ffffff",
					fontSize: 8,
				},

				lineStyle: {
					shadowColor: "rgba(69, 233, 164, 1)",
					shadowBlur: 20,
					shadowOffsetY: 0,
					width: 1,
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "#45E9A4",
						},
						{
							offset: 1,
							color: "rgba(19,99,61,1)",
						},
					]),
				},
				areaStyle: {
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(25, 255, 236, 0.4)",
						},
						{
							color: "rgba(51, 153, 255, 0)",
							offset: 1,
						},
					]),
				},
			},
			{
				name: "2022年",
				data: [1200, 700, 500, 700, 1300, 500, 200, 500, 1200, 700, 400, 1100],
				type: "line",
				smooth: true,
				symbol:
					"image://data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAQ5JREFUOE+1la1OQ0EQRs8kCFIQdVCCxIBpCK1AInkDHC+B4QkwvASub4GsaE0NGCRpKhGFVDQZ+Mjem9vNbkphmWTMfjNnd3b2x0iYuxuwH7wNbIewBfAGzORm5nG6ElfM3QU6AXZSkzXG3oEnMxO8thWgux8DR2tAsfxiZs/VYA38Jazi1NBvYCizv+HK4vCRyrfQgIsf7Nm6+bSnjwIeAGeZaGnXQDfoE+ABmGbixwKeAoeJAMHuv3w30ubATQb6KqDKjZPEuAXOMysZAncJbS7gJbCVEAdAKwP8AK4S2vJfgMVLLt6UDtAreWx0W8od7OJXryq16OPwR2j6+WpAyz2wDagape7vARt9AZ+G3HmhiKS3xwAAAABJRU5ErkJggg==",
				symbolSize: 10,
				showSymbol: false, // 是否显示 symbol, 如果 false 则只有在 tooltip hover 的时候显示。
				yAxisIndex: 0,
				z: 0,
				// 设置高亮样式
				emphasis: {
					focus: "none",
					itemStyle: { color: "white" },
				},
				label: {
					show: true,
					position: "top",
					distance: 10,
					color: "#ffffff",
					fontSize: 8,
				},

				// 第 3 层：2022 年的「粗底线」。与第 1 层同数据（第 1 层挂在影子 x 轴上，本层
				// 用第一根 x 轴，两类目一致所以视觉对齐），线宽 3 并用 shadowOffsetY 10 把暗阴影压到线下，作为发光底座；
				// z 为 0 让它垫在 z 3 的细亮线之下，两者叠加才有霓虹描边的层次
				lineStyle: {
					shadowColor: "rgba(0, 0, 0, 0.4)",
					shadowBlur: 3,
					shadowOffsetY: 10,
					width: 3,
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(115, 208, 255, 1)",
						},
						{
							offset: 1,
							color: "rgba(18,60,98,1)",
						},
					]),
				},
				areaStyle: {
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(25, 255, 236, 0.4)",
						},
						{
							color: "rgba(51, 153, 255, 0)",
							offset: 1,
						},
					]),
				},
			},
			{
				name: "2023年",
				data: [500, 900, 1100, 600, 400, 600, 1300, 900, 700, 1000, 500, 300],
				type: "line",
				smooth: true,
				symbol:
					"image://data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAQ5JREFUOE+1la1OQ0EQRs8kCFIQdVCCxIBpCK1AInkDHC+B4QkwvASub4GsaE0NGCRpKhGFVDQZ+Mjem9vNbkphmWTMfjNnd3b2x0iYuxuwH7wNbIewBfAGzORm5nG6ElfM3QU6AXZSkzXG3oEnMxO8thWgux8DR2tAsfxiZs/VYA38Jazi1NBvYCizv+HK4vCRyrfQgIsf7Nm6+bSnjwIeAGeZaGnXQDfoE+ABmGbixwKeAoeJAMHuv3w30ubATQb6KqDKjZPEuAXOMysZAncJbS7gJbCVEAdAKwP8AK4S2vJfgMVLLt6UDtAreWx0W8od7OJXryq16OPwR2j6+WpAyz2wDagape7vARt9AZ+G3HmhiKS3xwAAAABJRU5ErkJggg==",
				symbolSize: 10,
				showSymbol: false, // 是否显示 symbol, 如果 false 则只有在 tooltip hover 的时候显示。
				yAxisIndex: 0,
				z: 0,
				// 设置高亮样式
				emphasis: {
					focus: "none",
					itemStyle: { color: "white" },
				},
				label: {
					show: true,
					position: "top",
					distance: 10,
					color: "#ffffff",
					fontSize: 8,
				},

				// 第 4 层：2023 年的粗底线，配色换成绿系以区分同比年份，作用与第 3 层相同
				lineStyle: {
					shadowColor: "rgba(0, 0, 0, 0.4)",
					shadowBlur: 3,
					shadowOffsetY: 10,
					width: 3,
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "#44E6A2",
						},
						{
							offset: 1,
							color: "rgba(19,99,61,1)",
						},
					]),
				},
				areaStyle: {
					color: new graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0,
							color: "rgba(25, 255, 236, 0.4)",
						},
						{
							color: "rgba(51, 153, 255, 0)",
							offset: 1,
						},
					]),
				},
			},
		],
	} satisfies EChartsOption;

	/**
	 * 初始化实例并绑定尺寸观察。
	 * 返回一个清理函数供 onCleanup 调用；chartRef 未挂载时直接返回 undefined，调用方需可选调用。
	 * 观察目标就是图表容器本身，因此卡片宽度由 flex 撑开、窗口缩放、侧边栏折叠等变化都能捕获。
	 */
	const initChart = () => {
		if (!chartRef) return;

		chartInstance = init(chartRef);
		// 未显式配置 animation，这里沿用 ECharts 默认的 1000ms 入场动画；
		// 卡片本身由外层 CSS transform 滑入，图表不再叠加自定义时序，避免两个动画互相干扰
		chartInstance.setOption(option);

		// 自动调整大小
		const resizeObserver = new ResizeObserver(() => {
			chartInstance?.resize();
		});

		resizeObserver.observe(chartRef);

		return () => {
			resizeObserver.disconnect();
		};
	};

	/**
	 * 销毁实例并置空引用：dispose 会释放 canvas 与内部事件监听，
	 * 之后再调用 resize 会被可选链与判空挡掉，不会报错。
	 */
	const disposeChart = () => {
		if (chartInstance) {
			chartInstance.dispose();
			chartInstance = null;
		}
	};

	// setOption 只在这里发生一次；数据是常量，所以没有把 option 放进 createEffect 监听
	onMount(() => {
		const cleanupResize = initChart();

		// 卸载顺序：先断开 ResizeObserver（避免销毁过程中再触发 resize），再 dispose 实例
		onCleanup(() => {
			cleanupResize?.();
			disposeChart();
		});
	});

	// 外层 div 的初始 translate/opacity 由大屏入场动画（GSAP）驱动，这里只负责占位与挂载点
	return (
		<div
			id="right-card"
			class="tw:flex-1 tw:mb-3 tw:translate-x-[150%] tw:opacity-0"
		>
			<Card title="用电情况">
				<div ref={chartRef} class="tw:size-full" />
			</Card>
		</div>
	);
}

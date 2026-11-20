/**
 * 蓝色大屏左右两列面板的内容编排层。
 * 由 screens/blue/index.tsx 渲染，接收当前是否处于全球视图的标记，
 * 同一个格子按视图在不同图表之间互换：左侧为占比图、趋势图、明细/指标卡，
 * 右侧为仪表盘、趋势图、明细/指标卡。
 * 图表 option 全部取自 ./options 中的静态配置，数值是演示数据；
 * 接入真实接口时只需替换本层传给 Chart 的 option，不必改动面板结构。
 */
import { Show } from "solid-js";
import "../panels.css";
import Chart from "./chart";
import Donut from "./donut";
import { DataRows, Gauges, MetricCards } from "./metrics";
import {
	economy,
	globeDonutOption,
	monthly,
	pointedColumns,
	sales,
} from "./options";
import Panel from "./panel";

/**
 * 左侧面板列：三块面板垂直均分整列高度。
 * 中国视图下依次是立体环形占比图（Donut）、三月销售柱状图（sales）、滚动明细行（DataRows）；
 * 全球视图下依次是 ECharts 环形图（globeDonutOption）、尖顶柱状图（pointedColumns）、指标卡（MetricCards）。
 * @param props.globe 视图开关，来自父组件 view() === "globe" 的响应式求值；默认 undefined 按中国视图渲染
 * 切换视图时仅通过 Show 替换面板内的子节点，面板外框实例保留，避免重复播放边框流光动画。
 */
export function BlueLeftPanels(props: { globe?: boolean } = {}) {
	// 注意 fallback 才是中国视图内容：props.globe 为真时才走 Show 的子节点（全球视图）。
	return (
		<div class="blue-panel-column">
			<Panel>
				<Show when={props.globe} fallback={<Donut />}>
					<div class="blue-flat-donut">
						<Chart option={globeDonutOption} label="全球四类数据占比总计7331" />
					</div>
				</Show>
			</Panel>
			<Panel>
				<Show
					when={props.globe}
					fallback={<Chart option={sales} label="三类数据三月销售趋势" />}
				>
					<Chart option={pointedColumns} label="三月每日数据走势" />
				</Show>
			</Panel>
			<Panel>
				<Show when={props.globe} fallback={<DataRows />}>
					<MetricCards />
				</Show>
			</Panel>
		</div>
	);
}

/**
 * 右侧面板列：结构与左列对称，外框通过 side="right" 做水平镜像。
 * 第一块仪表盘三块视图共用；第二块在中国视图显示两年经济折线（economy），全球视图复用销售柱状图；
 * 第三块在中国视图显示月度分类柱线混合图（monthly），全球视图显示滚动明细行。
 * @param props.globe 视图开关，含义同 BlueLeftPanels
 */
export function BlueRightPanels(props: { globe?: boolean } = {}) {
	return (
		<div class="blue-panel-column">
			<Panel side="right">
				<Gauges />
			</Panel>
			<Panel side="right">
				<Show
					when={props.globe}
					fallback={<Chart option={economy} label="2022年和2023年经济趋势" />}
				>
					<Chart option={sales} label="三类数据三月销售趋势" />
				</Show>
			</Panel>
			<Panel side="right">
				<Show
					when={props.globe}
					fallback={<Chart option={monthly} label="各月份分类数据及增长趋势" />}
				>
					<DataRows />
				</Show>
			</Panel>
		</div>
	);
}

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

export function BlueLeftPanels(props: { globe?: boolean } = {}) {
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

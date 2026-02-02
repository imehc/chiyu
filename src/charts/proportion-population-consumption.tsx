import { graphic, init, type ECharts, type EChartsOption } from "echarts";
import Card from "../componnets/card";
import { onCleanup, onMount } from "solid-js";
import './proportion-population-consumption.css'

export default function ProportionPopulationConsumption() {
    const pieDataColor = ["#17E6C3", "#40CFFF", "#1979FF", "#FFC472"]
    const pieData = [
        { name: "类型1", value: 40 },
        { name: "类型2", value: 25, },
        { name: "类型3", value: 20, },
        { name: "类型4", value: 15, },
    ]

    let chartRef: HTMLDivElement | undefined;
    let chartInstance: ECharts | null = null;

    const option = {
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "shadow",
                shadowStyle: { opacity: 0 },
            },
            backgroundColor: "rgba(0,0,0,1)",
            borderWidth: 1,
            borderColor: "#999999",
            textStyle: {
                color: "#ffffff",
                fontSize: 10,
            },
        },

        series: [
            {
                name: "",
                type: "pie",
                itemStyle: {
                    borderWidth: 5,
                    borderColor: "rgba(26, 57, 77,1)",
                },
                label: { show: false },
                radius: ["55%", "70%"],
                color: ["#c487ee", "#deb140", "#49dff0", "#034079", "#6f81da", "#00ffb4"],

                data: [
                    {
                        value: 40,
                        name: "类型1",
                        itemStyle: {
                            //颜色渐变
                            color: new graphic.LinearGradient(0, 0, 1, 1, [
                                { offset: 0, color: "rgba(3,65,128,1)" },
                                { offset: 1, color: "rgba(115,208,255,1)" },
                            ]),
                        },
                    },
                    {
                        value: 25,
                        name: "类型2",
                        itemStyle: {
                            //颜色渐变
                            color: new graphic.LinearGradient(0, 0, 1, 1, [
                                { offset: 0, color: "rgba(11, 77, 44, 1)" },
                                { offset: 1, color: "rgba(77, 255, 181, 1)" },
                            ]),
                        },
                    },
                    {
                        value: 20,
                        name: "类型3",
                        itemStyle: {
                            //颜色渐变
                            color: new graphic.LinearGradient(0, 0, 1, 1, [
                                { offset: 0, color: "rgba(117, 117, 117, 1)" },
                                { offset: 1, color: "rgba(230, 230, 230, 1)" },
                            ]),
                        },
                    },
                    {
                        value: 15,
                        name: "类型4",
                        itemStyle: {
                            //颜色渐变
                            color: new graphic.LinearGradient(0, 0, 1, 1, [
                                { offset: 0, color: "rgba(153, 105, 38, 1)" },
                                { offset: 1, color: "rgba(255, 200, 89, 1)" },
                            ]),
                        },
                    },
                ],
            },
        ],
    } satisfies EChartsOption

    const initChart = () => {
        if (!chartRef) return;

        chartInstance = init(chartRef);
        chartInstance.setOption(option);

        // 自动调整大小
        const resizeObserver = new ResizeObserver(() => {
            chartInstance?.resize();
        });

        resizeObserver.observe(chartRef);

        return () => {
            resizeObserver.disconnect();
        };
    }

    const disposeChart = () => {
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }
    };

    onMount(() => {
        const cleanupResize = initChart();

        onCleanup(() => {
            cleanupResize?.();
            disposeChart();
        });
    });

    return (
        <div class="right-card">
            <Card title="人群消费占比">
                <div class="population-proportion">
                    <div class="population-proportion-chart">
                        <div ref={chartRef} class="size-full" />
                        <div class="label-name">消费占比</div>
                    </div>
                    <div class="pie-legend">
                        {pieData.map((item, idx) => (
                            <div class="pie-legend-item">
                                <div class="icon" style={{ "border-color": pieDataColor[idx] }}></div>
                                <div class="name">{item.name}</div>
                                <div class="value">
                                    {item.value}
                                    <span class="unit">%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
        </div>
    )
}
import Card from "../componnets/card";
import StatisticalCount from "../layouts/statistical-count";
import PieChart from "./pie";
import './yearly-economy-trend.css'

export default function YearlyEconomyTrend() {
    const pieDataColor = ["#17E6C3", "#40CFFF", "#1979FF", "#FFC472"]
    const pieData = [
        { name: '类型1', value: 400 },
        { name: '类型2', value: 250 },
        { name: '类型3', value: 200 },
        { name: '类型4', value: 150 },
    ]
    return (
        <div class="left-card">
            <Card title="年度经济增长点">
                <div class="pie-chat-wrap">
                    <div class="pie-chat">
                        <PieChart
                            data={pieData}
                            colors={pieDataColor}
                            delay={3000}
                            opacity={0.6}
                            class="pieCanvas"
                        >
                            {({ name, value, count }) => (
                                <div class="pieCanvas-content">
                                    <div class="pieCanvas-content-value">
                                        <StatisticalCount
                                            startVal={0}
                                            endVal={Number(((value / count) * 100).toFixed(2))}
                                            decimals={2}
                                            duration={1000}
                                            autoplay
                                        />
                                        %
                                    </div>
                                    <div class="pieCanvas-content-name">
                                        {name}
                                    </div>
                                </div>
                            )}
                        </PieChart>
                    </div>
                    <div class="pie-legend">
                        {
                            pieData.map((item, idx) => (
                                <div class="pie-legend-item">
                                    <div class="icon" style={{ "border-color": pieDataColor[idx] }}></div>
                                    <div class="name">{item.name}</div>
                                    <div class="value">{item.value}<span class="unit">亿</span></div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </Card>
        </div>
    )
}
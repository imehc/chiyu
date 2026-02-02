import { type StatisticalCard } from '../helper/map'
import StatisticalCount from './statistical-count'
import './statistical-card.css'

export default function StatisticalCard({
    icon = 'xiaoshoujine',
    zhLabel = '2025年销售金额',
    enLabel = 'Sales amount in 2025',
    value = 9500,
    unit = '万元',
    decimals = 0,
}: StatisticalCard) {
    return (
        <div class="count-card">
            <div class="count-card-left">
                <div class={`count-card-icon icon-${icon}`}></div>
                <div class="count-card-title leading-none">
                    <div class="title-zh">{zhLabel}</div>
                    <div class="title-en">{enLabel.toUpperCase()}</div>
                </div>
            </div>
            <div class="count-card-right">
                <div class="value">
                    <StatisticalCount
                        startVal={0}
                        endVal={value}
                        decimals={decimals}
                        duration={2000}
                        separator=""
                        autoplay
                    />
                </div>
                <div class="unit">{unit}</div>
            </div>
        </div>
    )
}
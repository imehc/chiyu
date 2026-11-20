/**
 * 底部统计卡：图标 + 中英文指标名 + 滚动数字 + 单位。
 * 常驻在托盘两侧，数字部分交给 statistical-count 做从 0 到目标值的缓动动画；
 * 入场时由 GSAP 按 #count-card 选择器统一上移淡入。
 */
import { cn } from "cn";

/**
 * 统计卡的入参结构，与业务的指标数据一一对应。
 * 数值含义由调用方决定（金额、件数等），组件只负责呈现。
 */
export interface Statistical {
	/** 图标类型，决定使用哪张内置图标图 */
	icon: "xiaoshoujine" | "zongxiaoliang";
	/** 中文指标名，如「2025年销售金额」 */
	zhLabel: string;
	/** 英文指标名，渲染时统一转大写 */
	enLabel: string;
	/** 目标数值，动画从 0 滚动到该值 */
	value: number;
	/** 单位，显示在数字右侧 */
	unit: string;
	/** 小数位数，0 表示取整；大于 0 时按该精度四舍五入 */
	decimals?: number;
}
import StatisticalCount from "./statistical-count";

/**
 * 统计卡组件。
 * 卡片整体带 translate-y-full 初始位移，等 GSAP 时间线推进到 card 标签时才归位。
 */
export default function StatisticalCard({
	icon = "xiaoshoujine",
	zhLabel = "2025年销售金额",
	enLabel = "Sales amount in 2025",
	value = 9500,
	unit = "万元",
	decimals = 0,
}: Statistical) {
	// id="count-card" 供 GSAP 批量选中做错峰入场；
	// separator 传空串等于关闭千分位，避免大数字变宽后把单位挤到卡片外
	return (
		<div
			id="count-card"
			class={cn(
				"tw:px-12 tw:flex tw:items-center",
				"tw:opacity-0 tw:translate-y-full",
			)}
		>
			<div class="tw:flex tw:items-center">
				<div
					class={cn(
						"tw:size-14 tw:mr-2.5 tw:bg-no-repeat tw:bg-center tw:bg-[length:100%]",
						[
							icon === "xiaoshoujine"
								? "tw:bg-[url(/assets/images/icon1.png)]"
								: "tw:bg-[url(/assets/images/icon2.png)]",
						],
					)}
				></div>
				<div>
					<div class="tw:font-bold tw:text-lg tw:text-white tw:whitespace-nowrap tw:leading-none">
						{zhLabel}
					</div>
					<div class="tw:font-d-din tw:font-normal tw:text-xs tw:text-white tw:opacity-50 tw:pt-1 tw:whitespace-nowrap">
						{enLabel.toUpperCase()}
					</div>
				</div>
			</div>
			<div class="tw:flex tw:items-center tw:pl-5">
				<div
					class={cn(
						"tw:font-d-din tw:font-bold tw:text-3xl tw:text-white",
						"tw:tracking-wide tw:mr-2.5 tw:text-nowrap",
						"tw:[text-shadow:0px_0px_18px_#ffffffb3]",
					)}
				>
					<StatisticalCount
						startVal={0}
						endVal={value}
						decimals={decimals}
						duration={2000}
						separator=""
						autoplay
					/>
				</div>
				<div
					class={cn(
						"tw:font-medium tw:text-xs tw:text-white tw:pt-4",
						"tw:opacity-50 tw:whitespace-nowrap",
					)}
				>
					{unit}
				</div>
			</div>
		</div>
	);
}

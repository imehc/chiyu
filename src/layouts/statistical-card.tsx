import type { Statistical } from "../helper/map";
import { cn } from "../utils/cn";
import StatisticalCount from "./statistical-count";

export default function StatisticalCard({
	icon = "xiaoshoujine",
	zhLabel = "2025年销售金额",
	enLabel = "Sales amount in 2025",
	value = 9500,
	unit = "万元",
	decimals = 0,
}: Statistical) {
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

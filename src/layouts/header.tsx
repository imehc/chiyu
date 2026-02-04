import type { JSXElement } from "solid-js";
import SvgLineAnimation from "../componnets/svg-line-animation";
import { cn } from "../utils/cn";

interface HeaderProps {
	/** 标题 @default '数据可视化大屏' */
	title?: string;
	/** 副标题 @default 'Visualization Platform' */
	subText?: string;
	leftChindren?: JSXElement;
	rightChindren?: JSXElement;
}

export default function Header({
	title = "数据可视化大屏",
	subText = "Visualization Platform",
	leftChindren,
	rightChindren,
}: HeaderProps) {
	return (
		<div
			id="header"
			class={cn(
				"tw:relative tw:left-0 tw:top-0 tw:right-0 tw:w-full tw:h-22.5 tw:z-2",
				"tw:opacity-0 tw:-translate-y-full",
			)}
		>
			<div
				class={cn(
					"tw:absolute tw:left-1/2 tw:-translate-x-1/2 tw:w-480 tw:h-22.5 tw:mx-auto",
					"tw:bg-[url(/assets/images/header-bg.png)] tw:bg-[length:100%]",
					"tw:text-center tw:box-border tw:pt-2.5",
				)}
			>
				<div
					class={cn(
						"tw:text-white tw:text-[2.75rem] tw:leading-12 tw:tracking-wider",
						"tw:font-alimama-shuhei tw:bg-clip-text tw:text-transparent",
						"tw:bg-gradient-to-b tw:from-[#75e8ff] tw:to-white",
					)}
				>
					{title}
				</div>
				<div
					class={cn(
						"tw:opacity-65 tw:text-xs tw:tracking-[0.25em] tw:font-light",
						"tw:text-[#c4f3fe] tw:font-d-din",
					)}
				>
					{subText}
				</div>
			</div>
			<div class="tw:text-white tw:absolute tw:top-12 tw:left-9">
				{leftChindren}
			</div>
			<div class="tw:text-white tw:absolute tw:top-12 tw:right-9">
				{rightChindren}
			</div>
			<div>
				<SvgLineAnimation
					class="tw:absolute tw:right-1/2 tw:top-3 tw:w-240 tw:h-20 tw:mr-3"
					width={961}
					height={79}
					color="#30DCFF"
					strokeWidth={2}
					dir={[0, 1]}
					length={100}
					path="M1 1.52783L535 25.6808C552.73 26.5835 571.454 31.3851 588.834 39.2194C593.758 41.4385 598.692 43.7289 603.643 46.0273C633.567 59.9182 664.121 74.1016 696.754 74.6262C696.765 74.6264 696.775 74.6265 696.786 74.6267C821.602 76.5993 879.336 78 961 78"
				/>
				<SvgLineAnimation
					class="tw:-scale-x-100 tw:absolute tw:-translate-x-6 tw:left-1/2 tw:top-3 tw:w-240 tw:h-20 tw:ml-3"
					width={961}
					height={79}
					color="#30DCFF"
					strokeWidth={2}
					dir={[0, 1]}
					length={100}
					path="M1 1.52783L535 25.6808C552.73 26.5835 571.454 31.3851 588.834 39.2194C593.758 41.4385 598.692 43.7289 603.643 46.0273C633.567 59.9182 664.121 74.1016 696.754 74.6262C696.765 74.6264 696.775 74.6265 696.786 74.6267C821.602 76.5993 879.336 78 961 78"
				/>
				<SvgLineAnimation
					class="tw:absolute tw:right-1/2 tw:-top-1.5 tw:w-82 tw:h-7.5 tw:mr-74"
					width={329}
					height={30}
					color="#30DCFF"
					strokeWidth={2}
					dir={[0, 1]}
					length={100}
					path="M1 1C6.62978 9.69943 71.3073 17.9776 182.506 24.1546C217.445 26.0955 256.119 27.7812 297.588 29.1902C302.543 29.3585 307.347 27.4694 310.865 23.9759L328.042 6.91683"
				/>
				<SvgLineAnimation
					class="tw:-scale-x-100 tw:absolute tw:left-1/2 tw:-top-1.5 tw:w-82 tw:h-7.5 tw:ml-72"
					width={329}
					height={30}
					color="#30DCFF"
					strokeWidth={2}
					dir={[0, 1]}
					length={100}
					path="M1 1C6.62978 9.69943 71.3073 17.9776 182.506 24.1546C217.445 26.0955 256.119 27.7812 297.588 29.1902C302.543 29.3585 307.347 27.4694 310.865 23.9759L328.042 6.91683"
				/>
			</div>
		</div>
	);
}

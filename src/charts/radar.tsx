import { cn } from "../utils/cn";

export default function Radar() {
	return (
		<div class="tw:relative tw:size-23">
			<img
				class="tw:size-full"
				src="/assets/images/radar/radar-bg.png"
				alt=""
			/>
			<img
				class={cn(
					"tw:absolute tw:left-1/2 tw:top-1/2 tw:-translate-1/2",
					"tw:size-20 tw:animate-[rotate360Animate_3s_linear_infinite]",
				)}
				src="/assets/images/radar/saomiao.png"
				alt=""
			/>
		</div>
	);
}

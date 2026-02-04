import { cn } from "../utils/cn";

interface BottomProps {
	title?: string;
	isActive?: boolean;
}

export default function Bottom({ title, isActive = false }: BottomProps) {
	return (
		<div
			class={cn(
				"tw:w-25 tw:h-8 tw:text-base tw:cursor-pointer",
				"tw:tracking-[1.6px] tw:text-center tw:pointer-events-auto",
				"tw:bg-[length:100%] tw:bg-no-repeat",
				[
					isActive
						? "tw:bg-[url(/assets/images/bottom-menu-btn-hover.png)]"
						: "tw:bg-[url(/assets/images/bottom-menu-btn.png)]",
				],
				"tw:hover:bg-[length:100%] tw:hover:bg-no-repeat",
				"tw:hover:bg-[url(/assets/images/bottom-menu-btn-hover.png)]",
			)}
		>
			<span
				class={cn(
					"tw:block tw:size-full tw:font-bold tw:leading-8",
					"tw:bg-clip-text tw:text-transparent",
					"tw:bg-gradient-to-b tw:from-[#75e8ff] tw:to-[#ffffff]",
				)}
			>
				{title}
			</span>
		</div>
	);
}

import type { JSX } from "solid-js";
import { cn } from "../../utils/cn";
import { useMenu } from "./index";

interface MenuItemProps {
	index: string | number;
	children: JSX.Element;
}

export function MenuItem(props: MenuItemProps) {
	const menu = useMenu();

	const handleClick = () => {
		menu.updateActive(props.index);
	};

	return (
		<button
			type="button"
			class={cn(
				"tw:relative tw:flex tw:justify-center tw:items-center",
				"tw:z-1 tw:pointer-events-auto tw:w-25 tw:h-8",
				"tw:bg-[length:100%]",
				"tw:text-base tw:mx-3 tw:cursor-pointer",
				[
					menu.activeIndex() === props.index
						? cn(
								"tw:text-white tw:bg-[url(/assets/images/menu-btn-hover.png)]",
								"tw:after:content-['']",
								"tw:after:block tw:after:w-25 tw:after:h-8 tw:after:bg-[length:100%]",
								"tw:after:absolute tw:after:left-1/2 tw:after:top-1/2 tw:after:-translate-1/2",
								"tw:after:-z-1 tw:after:opacity-100 tw:after:bg-[#00aaff8c] tw:after:rounded-4xl",
								"tw:after:scale-x-[1.1] tw:after:scale-y-[1.2]",
								"tw:after:animate-[menuActiveScale_1s_infinite]"
							)
						: "tw:text-[#ffffff99] tw:bg-[url(/assets/images/menu-btn.png)]",
				],
				"tw:hover:text-white tw:hover:bg-[url(/assets/images/menu-btn-hover.png)]",
			)}
			onClick={handleClick}
		>
			{props.children}
		</button>
	);
}

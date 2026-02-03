import type { JSX } from "solid-js";
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
			class="m-menu-item"
			classList={{ "is-active": menu.activeIndex() === props.index }}
			onClick={handleClick}
		>
			{props.children}
		</button>
	);
}

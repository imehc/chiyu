/**
 * 菜单按钮：从 Menu 的 Context 读取选中项，点击时更新选中并触发 onSelect。
 * 选中态除了换背景图，还用 ::after 伪元素叠一圈无限循环扩散的光晕。
 */

import { cn } from "cn";
import type { JSX } from "solid-js";
import { useMenu } from "./index";

interface MenuItemProps {
	/** 唯一标识，与 Menu 的 activeIndex 比较来判断是否选中；数字与字符串不要混用 */
	index: string | number;
	/** 按钮文案 */
	children: JSX.Element;
}

/**
 * 单个菜单项。
 * 样式全部依赖 menu.activeIndex()，选中切换时 Solid 只更新 class，不重建按钮。
 */
export function MenuItem(props: MenuItemProps) {
	const menu = useMenu();

	const handleClick = () => {
		menu.updateActive(props.index);
	};

	// 选中态的 ::after 是居中的圆角矩形，靠 menuActiveScale 每秒从 1 倍扩到 1.1/1.2 并淡出，
	// 形成呼吸光圈；-z-1 把它压到文字下方，scale 类只在动画未生效时充当兜底尺寸
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

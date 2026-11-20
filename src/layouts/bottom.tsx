/**
 * 底部托盘里的单个按钮（如「返回」「重播」）。
 * 纯展示组件，只根据 isActive 切换底图，点击行为由父级在外层绑定。
 */
import { cn } from "cn";

interface BottomProps {
	/** 按钮文案 */
	title?: string;
	/** 是否为当前激活项，激活时使用高亮底图 */
	isActive?: boolean;
}

/** 底部按钮：尺寸固定在 100×32，靠背景图区分普通/激活/悬停三种状态。 */
export default function Bottom({ title, isActive = false }: BottomProps) {
	// 底图与文字分离：底图负责外框，文字用 bg-clip-text + 渐变做上浅下白；
	// hover 底图写在条件类之后，会覆盖激活态，因此鼠标移开后才回落到 isActive 决定的外观
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

import { cn } from "../../../utils/cn";

/** 地图主标签（中文名 + 英文名）的水平对齐方式，以 3D 锚点为基准 */
export type FocusLabelAlign = "left" | "center" | "right";

export interface FocusLabelData {
	name: string;
	enName: string;
	/**
	 * 对齐方式 @default 'left'
	 * 默认左对齐，与广东大屏原有版式一致；换成长英文全称时可改成 center。
	 */
	align?: FocusLabelAlign;
}

/**
 * 外层负责水平对齐位移。
 * CSS3D 以元素左上角为锚点：左对齐时文字从锚点向右展开，
 * 居中对齐时需要整块左移自身宽度的一半。
 */
const outerAlignClass: Record<FocusLabelAlign, string> = {
	left: "",
	center: "tw:-translate-x-1/2",
	right: "tw:-translate-x-full",
};

/** 内层控制中英文在该行宽度内的对齐 */
const innerAlignClass: Record<FocusLabelAlign, string> = {
	left: "tw:items-start tw:text-left",
	center: "tw:items-center tw:text-center",
	right: "tw:items-end tw:text-right",
};

/**
 * 生成地图主标签 HTML。
 *
 * 水平对齐放在外层 wrapper、垂直上浮动画留在 `#other-label` 上：
 * 两者若在同一元素，GSAP 写 transform 时会把居中的 translateX 一起覆盖掉。
 */
export function buildFocusLabelHtml(data: FocusLabelData) {
	const align = data.align ?? "left";
	return `<div class="${cn(
		"tw:absolute tw:top-0 tw:left-0",
		outerAlignClass[align],
		// 倒影挂在这里而不是外层标签元素：标签元素被绝对定位的子元素撑成 0 宽，
		// box-reflect 作用在它身上会没有可反射的内容。
		"tw:[-webkit-box-reflect:below_0_-webkit-linear-gradient(transparent,transparent_20%,#ffffff4d)]",
	)}">
		<div id="other-label" class="${cn(
			"tw:flex tw:flex-col tw:will-change-transform",
			innerAlignClass[align],
			"tw:translate-y-[200%] tw:opacity-0 tw:bg-none",
		)}">
			<span class="tw:text-5xl tw:whitespace-nowrap">${data.name}</span>
			<span class="tw:text-xs tw:leading-6 tw:font-normal tw:tracking-normal tw:text-[#a7d5ef] tw:whitespace-nowrap">${data.enName}</span>
		</div>
	</div>`;
}

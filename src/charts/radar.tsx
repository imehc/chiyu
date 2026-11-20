/**
 * 大屏雷达罗盘动画：底图 + 旋转扫描扇形两层贴图叠加，纯 CSS 动画，不占用 JS 主线程。
 * 重庆 / 广东 / 中国三套大屏都用它做装饰（中国大屏仅此一处雷达），不含任何业务数据。
 */
import { cn } from "cn";

/**
 * 静态雷达图标，尺寸由 CSS 固定（size-23 → 5.75rem），因此不需要 props 与响应式依赖。
 * 因为是无交互的纯装饰元素，两张 img 的 alt 都留空，避免读屏软件念出无意义内容。
 */
export default function Radar() {
	// 两层叠加：底层 img 是雷达底盘与刻度环，撑开容器并作为居中定位的基准；
	// 上层 img 是扫描扇形，靠 left/top 50% 加 -translate-1/2 居中，再绕自身中心匀速旋转。
	// 扫描层比底盘小一圈（size-20 对 size-23），避免转起来时戳出外圈描边。
	// 3s 一圈、linear、infinite，模拟真实雷达的等角速度扫掠，匀速是为了不出现停顿感。
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

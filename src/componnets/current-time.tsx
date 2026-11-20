/**
 * 顶栏右侧的日期时间显示。
 * 由 header 的 rightChindren 插槽使用，内部自建 1 秒定时器驱动刷新。
 */
import { format } from "date-fns";
import { createSignal, onCleanup } from "solid-js";

/**
 * 实时时钟，格式为「yyyy-MM-dd HH:mm:ss」。
 * 定时器在组件卸载时清除，避免大屏切换后残留多个 interval 持续触发更新。
 */
export default function CurrentTime() {
	const [time, setTime] = createSignal(new Date());

	const timer = setInterval(() => {
		setTime(new Date());
	}, 1000);

	onCleanup(() => clearInterval(timer));

	// 日期直接取 new Date()：该表达式无信号依赖，只在挂载时求值一次，跨天不会自动刷新
	return (
		<div>
			<span class="tw:pr-2 tw:text-[#c4f3fe] tw:text-sm tw:font-d-din">
				{format(new Date(), "yyyy-MM-dd")}
			</span>
			<span class="tw:pr-2 tw:text-[#c4f3fe] tw:text-sm tw:font-d-din">
				{format(time(), "HH:mm:ss")}
			</span>
		</div>
	);
}

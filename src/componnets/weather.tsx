/**
 * 顶栏天气展示占位组件。
 * 目前为写死的示例文案，由 header 的 leftChindren 插槽使用；
 * 接入真实气象接口后应改为 props 或内部请求。
 */
export default function Weather() {
	return (
		<div>
			<span class="tw:pr-2 tw:text-[#c4f3fe] tw:text-sm">小雨</span>
			<span class="tw:pr-2 tw:text-[#c4f3fe] tw:text-sm">27℃</span>
		</div>
	);
}

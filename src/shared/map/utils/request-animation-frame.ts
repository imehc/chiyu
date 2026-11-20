/**
 * 可暂停/恢复的 requestAnimationFrame 循环封装。
 * 被 Time 持有作为全屏唯一的逐帧驱动源：只在 start 时开启一个循环，
 * 用 isActive 标记保证重复 start 不会叠加出多条并行的 rAF，pause 时立即取消当前帧。
 */
/**
 * 创建一个受控的逐帧循环。
 * @param callback 每帧回调，调用方负责自己按 delta 计算动画进度
 * @returns 控制对象：start 启动、pause 暂停并取消帧、resume 恢复、isActive 查询状态
 */
export default function requestAnimationFrameFn(callback: () => void) {
	let rafId: number | null = null; // 当前 requestAnimationFrame 的 ID，用于 pause 时取消
	let isActive = false; // 是否处于活跃状态，兼作「循环是否已存在」的开关
	let paused = false; // 是否处于暂停状态，用于区分「未启动」与「启动后被暂停」

	/**
	 * 单帧执行体：先执行业务回调，再预约下一帧，从而形成自驱动的循环。
	 * 每次进入都重新校验 isActive/paused，处于暂停态时不再续帧，循环自然停下。
	 */
	function animate() {
		if (!isActive || paused) return; // 如果不活跃或暂停，不执行回调

		callback(); // 执行回调函数
		rafId = requestAnimationFrame(animate); // 继续请求下一帧
	}

	/**
	 * 启动循环。重复调用是幂等的，靠 isActive 判断避免出现两条并行循环。
	 */
	function start() {
		if (!isActive) {
			isActive = true; // 设置为活跃状态
			animate(); // 开始执行动画
		}
	}

	/**
	 * 暂停循环：清掉 isActive 并取消当前帧（rafId 未置 null），让浏览器不再为这一帧排队，
	 * 切到后台标签页或切屏时可省掉无谓的渲染开销。
	 */
	function pause() {
		if (isActive) {
			isActive = false; // 设置为不活跃状态
			paused = true; // 标记为暂停
			rafId && cancelAnimationFrame(rafId); // 取消当前帧
		}
	}

	/**
	 * 恢复循环。仅在「启动过且被暂停」时生效，直接调用 animate 续上原有循环；
	 * 若改调 start，paused 仍未复位，animate 首行会直接返回，循环反而不会继续。
	 */
	function resume() {
		if (!isActive && paused) {
			isActive = true; // 恢复为活跃状态
			paused = false; // 取消暂停标记
			animate(); // 直接执行动画而不是重新调用 start
		}
	}

	// 返回一个包含控制方法的对象
	return {
		start,
		pause,
		resume,
		isActive: () => isActive, // 使用函数返回状态，因为 isActive 可能在回调中改变
	};
}

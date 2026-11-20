/**
 * 数字滚动组件：用 requestAnimationFrame 在指定时长内把数值从 startVal 缓动到 endVal，
 * 每帧格式化（小数位、千分位、前后缀）后写入 span。
 * 由 statistical-card 使用；pause / resume / reset / start 均为组件内局部常量，
 * 当前未对外暴露，只通过 autoplay 自动播放。
 */
import {
	createEffect,
	createSignal,
	mergeProps,
	onCleanup,
	onMount,
} from "solid-js";

interface StatisticalCountProps {
	/** 起始数值，大于 endVal 时自动按倒计时处理 @default 0 */
	startVal?: number;
	/** 目标数值 @default 2017 */
	endVal?: number;
	/** 动画总时长，单位毫秒 @default 3000 */
	duration?: number;
	/** 挂载后及 startVal/endVal 变化时是否自动播放 @default true */
	autoplay?: boolean;
	/** 保留的小数位数，负数只告警不纠正 @default 0 */
	decimals?: number;
	/** 小数点符号 @default "." */
	decimal?: string;
	/** 千分位分隔符，传空串则不分隔 @default "," */
	separator?: string;
	/** 数字前缀，如货币符号 @default "" */
	prefix?: string;
	/** 数字后缀 @default "" */
	suffix?: string;
	/** 是否启用缓动，关闭后为匀速变化 @default true */
	useEasing?: boolean;
	/** 缓动函数，参数依次为已播放时长、起始值、差值、总时长 @default defaultEasingFn */
	easingFn?: (t: number, b: number, c: number, d: number) => number;
	/** 一轮动画结束（达到 endVal）时的回调 */
	onCallback?: () => void;
	/** 组件挂载完成后的回调，用于父级同步起始状态 */
	onMountedCallback?: () => void;
}

/**
 * 默认缓动函数（easeOutExpo 的变体）。
 * 标准写法在 t = d 时只能逼近 c，这里乘 1024/1023 做归一化，保证最后一帧精确落在目标值上，
 * 否则会出现「显示 9999.99 而不是 10000」的收尾误差。
 * @param t 已播放时长（毫秒）
 * @param b 起始值
 * @param c 需要变化的总量（目标值 - 起始值）
 * @param d 总时长（毫秒）
 */
const defaultEasingFn = (
	t: number,
	b: number,
	c: number,
	d: number,
): number => {
	return (c * (-(2 ** ((-10 * t) / d)) + 1) * 1024) / 1023 + b;
};

/**
 * 滚动数字。
 * 用 mergeProps 而不是解构：Solid 的 props 是 getter，
 * 解构会丢掉响应性，数值变化后动画就不会重启。
 */
export default function StatisticalCount(props: StatisticalCountProps) {
	// 合并默认 props
	const merged = mergeProps(
		{
			startVal: 0,
			endVal: 2017,
			duration: 3000,
			autoplay: true,
			decimals: 0,
			decimal: ".",
			separator: ",",
			prefix: "",
			suffix: "",
			useEasing: true,
			easingFn: defaultEasingFn,
		},
		props,
	);

	// 只提示不修正：调用方传负数通常是想取整，toFixed 会抛 RangeError，保持原值让错误暴露出来
	if (merged.decimals < 0) {
		console.warn("StatisticalCount: decimals must be >= 0");
	}

	// 创建响应式状态
	/** 已格式化好的展示文本，直接渲染到 span */
	const [displayValue, setDisplayValue] = createSignal<string>(
		formatNumber(merged.startVal, merged),
	);
	/** 当前未格式化的数值，暂停后恢复时作为新的起点 */
	const [printVal, setPrintVal] = createSignal<number>(merged.startVal);
	const [paused, setPaused] = createSignal<boolean>(false);
	/** 剩余时长（毫秒），暂停时算出差值，恢复时作为新的 localDuration */
	const [remaining, setRemaining] = createSignal<number>(merged.duration);

	// 内部可变状态（不需要响应式）
	let localStartVal = merged.startVal;
	let localDuration = merged.duration;
	/** 本段动画的起始时间戳，null 表示下一帧重新取基准 */
	let startTime: number | null = null;
	let timestamp: number | null = null;
	/** 当前动画帧句柄，取消时置空以避免重复 cancel */
	let rAF: number | null = null;

	// 计算属性：是否倒计时
	const countDown = () => merged.startVal > merged.endVal;

	// 辅助函数：判断是否为数字

	/**
	 * 格式化数值。
	 * 先按 decimals 定点，再在有分隔符时从右往左每三位插入；
	 * 分隔符本身必须是纯符号，否则 replace 的字符串替换会产生歧义（如传 "1" 会污染数字），
	 * 因此用 parseFloat 能否解析来判断并跳过。
	 * @param num 原始数值
	 * @param opts 格式化选项，默认取合并后的 props
	 * @returns 带前后缀的展示字符串
	 */
	function formatNumber(num: number, opts = merged): string {
		let formatted = num.toFixed(opts.decimals);
		formatted += "";
		const x = formatted.split(".");
		let x1 = x[0];
		const x2 = x.length > 1 ? opts.decimal + x[1] : "";
		const rgx = /(\d+)(\d{3})/;
		const isNumber = (val: string): boolean => !Number.isNaN(parseFloat(val));
		if (opts.separator && !isNumber(opts.separator)) {
			while (rgx.test(x1)) {
				x1 = x1.replace(rgx, `$1${opts.separator}$2`);
			}
		}
		return opts.prefix + x1 + x2 + opts.suffix;
	}

	// 动画循环
	/**
	 * 单帧动画，作为 requestAnimationFrame 的回调循环调用。
	 * 用绝对时间差（当前时间 - 起始时间）而非每帧累加，掉帧或切后台后进度不会漂移；
	 * 倒计时与正计时分别套用两个方向的缓动公式，最后再做边界夹取。
	 * @param currentTimestamp rAF 传入的高精度时间戳（毫秒）
	 */
	const count = (currentTimestamp: number) => {
		if (!startTime) startTime = currentTimestamp;
		timestamp = currentTimestamp;
		const progress = currentTimestamp - startTime;
		setRemaining(localDuration - progress);

		let newPrintVal: number;

		// 倒计时分支把「起始值 → 目标值」换算成「0 → 差值」再反向相减，
		// 这样同一套缓动曲线在正计时与倒计时下观感一致
		if (merged.useEasing) {
			if (countDown()) {
				newPrintVal =
					localStartVal -
					merged.easingFn(
						progress,
						0,
						localStartVal - merged.endVal,
						localDuration,
					);
			} else {
				newPrintVal = merged.easingFn(
					progress,
					localStartVal,
					merged.endVal - localStartVal,
					localDuration,
				);
			}
		} else {
			if (countDown()) {
				newPrintVal =
					localStartVal -
					(localStartVal - merged.endVal) * (progress / localDuration);
			} else {
				newPrintVal =
					localStartVal +
					(merged.endVal - localStartVal) * (progress / localDuration);
			}
		}

		// 边界检查：浮点误差可能让结果越过目标值，夹回 endVal 以保证末帧精确
		if (countDown()) {
			newPrintVal = newPrintVal < merged.endVal ? merged.endVal : newPrintVal;
		} else {
			newPrintVal = newPrintVal > merged.endVal ? merged.endVal : newPrintVal;
		}

		setPrintVal(newPrintVal);
		setDisplayValue(formatNumber(newPrintVal));

		if (progress < localDuration) {
			rAF = requestAnimationFrame(count);
		} else {
			props.onCallback?.();
		}
	};

	// 开始动画
	/**
	 * 从头播放一轮。
	 * 把 startTime 置空，让下一帧重新取基准时间；重复调用只会重置状态，
	 * 因为每帧都按绝对时间差计算，不会出现数值叠加。
	 */
	const start = () => {
		localStartVal = merged.startVal;
		startTime = null;
		localDuration = merged.duration;
		setPaused(false);
		rAF = requestAnimationFrame(count);
	};

	/** 暂停：取消当前帧后再置空句柄，避免重复取消同一个 id */
	const pause = () => {
		if (rAF) {
			cancelAnimationFrame(rAF);
			rAF = null;
		}
	};

	/**
	 * 恢复：把「已显示的值」当作新起点、剩余时长当作新总时长，
	 * 相当于把一轮长动画拆成若干段，缓动曲线会从中间重新加速（可接受的近似）。
	 */
	const resume = () => {
		startTime = null;
		localDuration = remaining();
		localStartVal = printVal();
		rAF = requestAnimationFrame(count);
	};

	/** 暂停/恢复切换，paused 只是 UI 状态，真正的计时由 rAF 是否在跑决定 */
	const pauseResume = () => {
		if (paused()) {
			resume();
			setPaused(false);
		} else {
			pause();
			setPaused(true);
		}
	};

	// 重置
	/** 重置：停掉动画并立刻回到起始值文本，不触发 onCallback */
	const reset = () => {
		startTime = null;
		if (rAF) {
			cancelAnimationFrame(rAF);
			rAF = null;
		}
		setDisplayValue(formatNumber(merged.startVal));
	};

	// 监听 startVal 和 endVal 变化
	// 拆成两个 effect：读哪个属性就依赖哪个，任一变化都从头重播；
	// 赋给下划线变量只是为了让 Solid 记录依赖，读值本身没有其它作用
	createEffect(() => {
		const _start = merged.startVal; // 追踪依赖
		if (merged.autoplay) {
			start();
		}
	});

	createEffect(() => {
		const _end = merged.endVal; // 追踪依赖
		if (merged.autoplay) {
			start();
		}
	});

	// 挂载时自动播放
	onMount(() => {
		if (merged.autoplay) {
			start();
		}
		props.onMountedCallback?.();
	});

	// 清理
	// 大屏切换时组件被卸载，必须取消未完成的帧回调，否则 rAF 会继续读取已销毁的信号
	onCleanup(() => {
		if (rAF) {
			cancelAnimationFrame(rAF);
		}
	});

	// 上述方法均为内部实现，当前未对外暴露，父组件无法调用

	// 只渲染纯文本，字号/字重/阴影交给父级，便于同一数字组件在不同卡片里复用
	return <span>{displayValue()}</span>;
}

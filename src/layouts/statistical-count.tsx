import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  mergeProps,
} from "solid-js";

interface StatisticalCountProps {
  startVal?: number;
  endVal?: number;
  duration?: number;
  autoplay?: boolean;
  decimals?: number;
  decimal?: string;
  separator?: string;
  prefix?: string;
  suffix?: string;
  useEasing?: boolean;
  easingFn?: (t: number, b: number, c: number, d: number) => number;
  onCallback?: () => void;
  onMountedCallback?: () => void;
}

// 默认缓动函数
const defaultEasingFn = (t: number, b: number, c: number, d: number): number => {
  return (c * (-Math.pow(2, (-10 * t) / d) + 1) * 1024) / 1023 + b;
};

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
    props
  );

  // 验证 decimals >= 0
  if (merged.decimals < 0) {
    console.warn("StatisticalCount: decimals must be >= 0");
  }

  // 创建响应式状态
  const [displayValue, setDisplayValue] = createSignal<string>(
    formatNumber(merged.startVal, merged)
  );
  const [printVal, setPrintVal] = createSignal<number>(merged.startVal);
  const [paused, setPaused] = createSignal<boolean>(false);
  const [remaining, setRemaining] = createSignal<number>(merged.duration);

  // 内部可变状态（不需要响应式）
  let localStartVal = merged.startVal;
  let localDuration = merged.duration;
  let startTime: number | null = null;
  let timestamp: number | null = null;
  let rAF: number | null = null;

  // 计算属性：是否倒计时
  const countDown = () => merged.startVal > merged.endVal;

  // 辅助函数：判断是否为数字
  
  // 格式化数字
  function formatNumber(num: number, opts = merged): string {
    let formatted = num.toFixed(opts.decimals);
    formatted += "";
    const x = formatted.split(".");
    let x1 = x[0];
    const x2 = x.length > 1 ? opts.decimal + x[1] : "";
    const rgx = /(\d+)(\d{3})/;
    const isNumber = (val: string): boolean => !isNaN(parseFloat(val));
    if (opts.separator && !isNumber(opts.separator)) {
      while (rgx.test(x1)) {
        x1 = x1.replace(rgx, "$1" + opts.separator + "$2");
      }
    }
    return opts.prefix + x1 + x2 + opts.suffix;
  }

  // 动画循环
  const count = (currentTimestamp: number) => {
    if (!startTime) startTime = currentTimestamp;
    timestamp = currentTimestamp;
    const progress = currentTimestamp - startTime;
    setRemaining(localDuration - progress);

    let newPrintVal: number;

    if (merged.useEasing) {
      if (countDown()) {
        newPrintVal =
          localStartVal -
          merged.easingFn(progress, 0, localStartVal - merged.endVal, localDuration);
      } else {
        newPrintVal = merged.easingFn(
          progress,
          localStartVal,
          merged.endVal - localStartVal,
          localDuration
        );
      }
    } else {
      if (countDown()) {
        newPrintVal =
          localStartVal - (localStartVal - merged.endVal) * (progress / localDuration);
      } else {
        newPrintVal =
          localStartVal + (merged.endVal - localStartVal) * (progress / localDuration);
      }
    }

    // 边界检查
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
  const start = () => {
    localStartVal = merged.startVal;
    startTime = null;
    localDuration = merged.duration;
    setPaused(false);
    rAF = requestAnimationFrame(count);
  };

  // 暂停
  const pause = () => {
    if (rAF) {
      cancelAnimationFrame(rAF);
      rAF = null;
    }
  };

  // 恢复
  const resume = () => {
    startTime = null;
    localDuration = remaining();
    localStartVal = printVal();
    rAF = requestAnimationFrame(count);
  };

  // 暂停/恢复切换
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
  const reset = () => {
    startTime = null;
    if (rAF) {
      cancelAnimationFrame(rAF);
      rAF = null;
    }
    setDisplayValue(formatNumber(merged.startVal));
  };

  // 监听 startVal 和 endVal 变化
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
  onCleanup(() => {
    if (rAF) {
      cancelAnimationFrame(rAF);
    }
  });

  // 暴露方法给父组件（通过 ref）
  // 如果需要，可以使用 createRef 或让父组件通过 props 传入控制函数

  return <span>{displayValue()}</span>;
}
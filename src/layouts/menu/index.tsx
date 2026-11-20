/**
 * 大屏顶部菜单容器：用 Context 在 Menu 与 MenuItem 之间共享「当前选中项」，
 * 避免每个按钮都要层层传 props。MenuItem 为唯一消费者，见 ./menu-item。
 */
import { createContext, createSignal, type JSX, useContext } from "solid-js";

// 创建上下文
interface MenuContextType {
	/** 当前选中项。用函数形式暴露，子组件渲染时读值才能建立响应式依赖 */
	activeIndex: () => string | number;
	/** 切换选中项，并同步回调 Menu 的 onSelect */
	updateActive: (index: string | number) => void;
}

/** 未提供默认值：脱离 Provider 使用会得到 undefined，由 useMenu 负责报错 */
const MenuContext = createContext<MenuContextType>();

// 导出 hook 供子组件使用
/**
 * 读取菜单上下文。
 * 在 Menu 之外调用会直接抛错，属于开发期误用，不做静默兜底。
 */
export const useMenu = () => {
	const context = useContext(MenuContext);
	if (!context) {
		throw new Error("useMenu must be used within a Menu component");
	}
	return context;
};

interface MenuProps {
	/** 初始选中项，只用于初始化内部信号，之后由点击自行维护（非受控） */
	defaultActive?: string | number;
	/** 选中项变化时回调，父级可据此切换内容或上报埋点 */
	onSelect?: (index: string | number) => void;
	/** 菜单项，按 flex 行排列 */
	children: JSX.Element;
}

/**
 * 菜单根组件：持有选中状态并通过 Provider 下发。
 * 菜单项之间互斥，点击任意一项都会覆盖前一项的选中状态。
 */
export default function Menu(props: MenuProps) {
	// 只在初始化时读一次 defaultActive，之后完全由点击驱动；
	// 用 || 兜底会把 undefined 变成空串，注意数字 0 也会被当成空值
	const [activeIndex, setActiveIndex] = createSignal(props.defaultActive || "");

	const updateActive = (index: string | number) => {
		setActiveIndex(index);
		props.onSelect?.(index);
	};

	// 创建上下文值
	const contextValue: MenuContextType = {
		activeIndex,
		updateActive,
	};

	// 监听 defaultActive 变化（SolidJS 使用 createEffect 或 on 来实现类似 watch 的功能）
	// 如果需要响应外部 defaultActive 变化，可以使用 createEffect
	// 这里简化为初始化值，如需响应外部变化可使用：
	/*
  createEffect(on(() => props.defaultActive, (newVal) => {
    if (newVal !== undefined && newVal !== activeIndex()) {
      setActiveIndex(newVal);
    }
  }));
  */

	// 容器只负责横向排列，按钮的背景图与激活态动画都封装在 MenuItem 里
	return (
		<MenuContext.Provider value={contextValue}>
			<div class="tw:flex">{props.children}</div>
		</MenuContext.Provider>
	);
}

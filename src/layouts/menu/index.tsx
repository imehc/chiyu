import { createSignal, createContext, useContext, JSX } from "solid-js";
import './index.css'

// 创建上下文
interface MenuContextType {
  activeIndex: () => string | number;
  updateActive: (index: string | number) => void;
}

const MenuContext = createContext<MenuContextType>();

// 导出 hook 供子组件使用
export const useMenu = () => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("useMenu must be used within a Menu component");
  }
  return context;
};

interface MenuProps {
  defaultActive?: string | number;
  onSelect?: (index: string | number) => void;
  children: JSX.Element;
}

export default function Menu(props: MenuProps) {
  const [activeIndex, setActiveIndex] = createSignal(props.defaultActive || "");
  
  const updateActive = (index: string | number) => {
    setActiveIndex(index);
    props.onSelect?.(index);
  };

  // 创建上下文值
  const contextValue: MenuContextType = {
    activeIndex,
    updateActive
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

  return (
    <MenuContext.Provider value={contextValue}>
      <div class="m-menu">
        {props.children}
      </div>
    </MenuContext.Provider>
  );
}
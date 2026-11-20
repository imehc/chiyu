/**
 * 应用入口：导入全局样式，把 App 挂到 index.html 的 #root 节点上。
 * @refresh reload 让 Vite 在开发时对本文件改动走整页刷新（入口重新执行才有效）。
 */
/* @refresh reload */
import './css/index.css';
import { render } from 'solid-js/web';

import App from './App';

const root = document.getElementById('root');

// 开发态校验挂载点，缺少 #root 时给出可操作的报错；生产构建不做这层检查
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

// 入口只执行一次；开发态上面已校验过，生产环境由 index.html 模板保证节点存在
render(() => <App />, root as HTMLElement);

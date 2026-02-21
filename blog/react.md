---
title: 'React 高级特性与生态详解'
date: '2021-07-01 11:03'
tags: ['React']
draft: false
summary: 'React 高级特性详解：代码分割、Context 状态管理、错误边界、Refs 转发、Fragments、Redux 集成与持久化等核心概念'
---

## React.lazy - 代码分割

`React.lazy` 函数允许你定义一个动态导入的组件，实现代码分割和懒加载。

<!-- truncate -->

### 基本用法

```jsx
// import React, { lazy, Suspense } from 'react'
const 组件名称 = React.lazy(() => import('组件路径'));

// 或
import 组件名称 = React.lazy(() => import('组件路径'));

function MyComponent() {
  return (
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <组件名称 />
      </Suspense>
    </div>
  );
}
```

<!-- fallback 属性接收组件加载过程中想要展示的 React 元素 -->

### 命名导出的处理

`React.lazy` 目前只支持默认导出（`default exports`）。如果你想引入使用命名导出（`named exports`）的模块，可以创建一个中间模块来重新导出为默认模块。

```jsx
// ManyComponents.js
export const MyComponent = /* ... */;
```

```jsx
// MyComponent.js - 中间模块
export { MyComponent as default } from './ManyComponents.js';
```

```jsx
// MyApp.js
import React, { lazy } from 'react';

const MyComponent = lazy(() => import('./MyComponent.js'));
```

---

## Context - 跨组件状态传递

`Context` 提供了一种无需每层手动添加 `props`，就能在组件树间传递数据的方法。

### React.createContext

```jsx
const MyContext = React.createContext(defaultValue);
// 确保传递给 createContext 的默认值数据结构是调用组件（consumers）所能匹配的！
```

创建一个 `Context` 对象。当 `React` 渲染一个订阅了这个 `Context` 对象的组件时，这个组件会从组件树中离自身最近的那个匹配的 `Provider` 中读取到当前的 `context` 值。

<!-- 只有当组件所处的树中没有匹配到 Provider 时，defaultValue 参数才会生效 -->

### Context.Provider

```jsx
<MyContext.Provider value={/* 某个值 */}>
  {children}
</MyContext.Provider>
```

`Provider` 接收一个 `value` 属性，传递给消费组件。一个 `Provider` 可以和多个消费组件有对应关系。多个 `Provider` 也可以嵌套使用，里层的会覆盖外层的数据。

### Class.contextType

```jsx
class MyClass extends React.Component {
  componentDidMount() {
    let value = this.context;
    // 组件挂载完成后，使用 MyContext 组件的值来执行一些有副作用的操作
  }

  componentDidUpdate() {
    let value = this.context;
    // ...
  }

  componentWillUnmount() {
    let value = this.context;
    // ...
  }

  render() {
    let value = this.context;
    // 基于 MyContext 组件的值进行渲染
  }
}

MyClass.contextType = MyContext;
```

挂载在 `class` 上的 `contextType` 属性会被重赋值为一个由 `React.createContext()` 创建的 `Context` 对象。这能让你使用 `this.context` 来消费最近 `Context` 上的那个值。你可以在任何生命周期中访问到它。

### Context.Consumer

```jsx
<MyContext.Consumer>
  {value => /* 基于 context 值进行渲染 */}
</MyContext.Consumer>
```

这个函数接收当前的 `context` 值，返回一个 `React` 节点。传递给函数的 `value` 值等同于往上组件树离这个 `context` 最近的 `Provider` 提供的 `value` 值。如果没有对应的 `Provider`，`value` 参数等同于传递给 `createContext()` 的 `defaultValue`。

### Context.displayName

```jsx
const MyContext = React.createContext(/* some value */);
MyContext.displayName = 'MyDisplayName';

// 在 DevTools 中显示为 "MyDisplayName.Provider"
<MyContext.Provider>
// 在 DevTools 中显示为 "MyDisplayName.Consumer"
<MyContext.Consumer>
```

`Context` 对象接受一个名为 `displayName` 的 `property`，类型为字符串。`React DevTools` 使用该字符串来确定 `context` 要显示的内容。

**[更多 Context 详情](https://react.docschina.org/docs/context.html)**

---

## 错误边界（Error Boundaries）

错误边界是一种 `React` 组件，可以捕获并打印发生在其子组件树任何位置的 `JavaScript` 错误，并且会渲染出备用 UI。

```jsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // 你同样可以将错误日志上报给服务器
    logErrorToMyService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 你可以自定义降级后的 UI 并渲染
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}
```

如果一个 `class` 组件中定义了 `static getDerivedStateFromError()` 或 `componentDidCatch()` 这两个生命周期方法中的任意一个（或两个）时，那么它就变成一个错误边界。当抛出错误后，请使用 `static getDerivedStateFromError()` 渲染备用 UI，使用 `componentDidCatch()` 打印错误信息。

```jsx
<ErrorBoundary>
  <MyWidget />
</ErrorBoundary>
```

然后你可以将它作为一个常规组件去使用。

---

## Refs 转发

`Ref` 转发是一项将 `ref` 自动地通过组件传递到其一子组件的技巧。

```jsx
// 1. 调用 React.createRef 创建 React ref 并赋值给 ref 变量
const ref = React.createRef();

// 2. 传递给 FancyButton
<FancyButton ref={ref}>Click me</FancyButton>;

// 3. React 传递给 forwardRef
const FancyButton = React.forwardRef((props, ref) => (
  <button ref={ref} className="FancyButton">
    // 4. 向下转发 ref，将其指定为 JSX 属性
    // 5. 当 ref 挂载完成，ref.current 将指向 <button> DOM 节点
    {props.children}
  </button>
));
```

`FancyButton` 使用 `React.forwardRef` 来获取传递给它的 `ref`，然后转发到它渲染的 DOM `button`。

```jsx
const WrappedComponent = React.forwardRef((props, ref) => {
  return <LogProps {...props} forwardedRef={ref} />;
});
```

`React.forwardRef` 接受一个渲染函数。`React DevTools` 使用该函数来决定为 `ref` 转发组件显示的内容。

---

## Fragments

`React` 中的一个常见模式是一个组件返回多个元素。`Fragments` 允许你将子列表分组，而无需向 `DOM` 添加额外节点。

```jsx
class Table extends React.Component {
  render() {
    return (
      <table>
        <tr>
          <Columns />
        </tr>
      </table>
    );
  }
}
```

`<Columns />` 需要返回多个 `<td>` 元素以使渲染的 `HTML` 有效。如果在 `<Columns />` 的 `render()` 中使用了父 `div`，则生成的 `HTML` 将无效。

```jsx
class Columns extends React.Component {
  render() {
    return (
      <React.Fragment>
        <td>Hello</td>
        <td>World</td>
      </React.Fragment>
    );
  }
}
```

`Fragments` 解决了这个问题。

### 短语法

```jsx
class Columns extends React.Component {
  render() {
    return (
      <>
        <td>Hello</td>
        <td>World</td>
      </>
    );
  }
}
```

你可以像使用任何其他元素一样使用 `<> </>`，除了它不支持 `key` 或属性。

### 带 key 的 Fragments

```jsx
function Glossary(props) {
  return (
    <dl>
      {props.items.map(item => (
        // 没有 `key`，React 会发出一个关键警告
        <React.Fragment key={item.id}>
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
```

`key` 是唯一可以传递给 `Fragment` 的属性。

---

## 高阶组件（HOC）

（内容待补充...）

---

## Refs and the DOM

### 创建 Refs

`Refs` 是使用 `React.createRef()` 创建的，并通过 `ref` 属性附加到 `React` 元素。在构造组件时，通常将 `Refs` 分配给实例属性，以便可以在整个组件中引用它们。

```jsx
class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    this.myRef = React.createRef();
  }

  render() {
    return <div ref={this.myRef} />;
  }
}
```

### 访问 Refs

当 `ref` 被传递给 `render` 中的元素时，对该节点的引用可以在 `ref` 的 `current` 属性中被访问。

```jsx
const node = this.myRef.current;
```

<!-- 
当 ref 属性用于 HTML 元素时，构造函数中使用 React.createRef() 创建的 ref 
接收底层 DOM 元素作为其 current 属性

当 ref 属性用于自定义 class 组件时，ref 对象接收组件的挂载实例作为其 current 属性

默认情况下，不能在函数组件使用 ref 属性，因为它们没有实例
-->

### 回调 Refs

（内容待补充...）

---

## React API

### React.forwardRef

创建一个 `React` 组件，能够将其接受的 `ref` 属性转发到其组件树下的另一个组件中。在转发 `refs` 到 `DOM` 组件、高阶组件中转发 `refs` 中特别有用。接收渲染函数作为参数，`React` 将使用 `props` 和 `ref` 作为参数来调用此函数，返回 `React` 节点。

```jsx
const FancyButton = React.forwardRef((props, ref) => (
  <button ref={ref} className="FancyButton">
    {props.children}
  </button>
));

const ref = React.createRef();
<FancyButton ref={ref}>Click me</FancyButton>
```

在上述的示例中，`React` 会将 `<FancyButton ref={ref}>` 元素的 `ref` 作为第二个参数传递给 `React.forwardRef` 函数中的渲染函数。该渲染函数会将 `ref` 传递给 `<button ref={ref}>` 元素。因此，当 `React` 附加了 `ref` 属性之后，`ref.current` 将直接指向 `<button>` `DOM` 元素实例。

---

## Hooks

<!-- Hook 是 React 16.8 的新增特性，可以在不编写 class 的情况下使用 state 以及其它的 React 特性 -->

```jsx
import React, { useState } from 'react';

function Example() {
  // 声明一个新的叫做 "count" 的 state 变量
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
```

---

## Redux 集成

需要先安装 `redux` 和 `react-redux`：

```bash
yarn add redux react-redux
```

### Store 配置

在 `src` 目录下新建一个 `redux` 文件夹，在文件夹下新建 `store.js`，在这里处理 `redux` 数据。在 `redux` 文件夹下再新建一个文件夹 `reducers`，用来处理多个不同的 `store` 数据，也方便管理。

```js
// store.js
// 引入 createStore 创建一个 Redux store 来存放所有的 store，应用中有且只有一个
// 引入 combineReducers 是为了合并多个 reducer 为一个
import { createStore, combineReducers } from 'redux';
// 引入 CollapsedReducer
import { CollapsedReducer } from './reducers/CollapsedReducer';

const reducer = combineReducers({
  CollapsedReducer, // 合并多个 store，这里采用了 ES6 的简写形式
});

const store = createStore(reducer); // 创建 store

export default store; // 导出
```

### Reducer 配置

```js
// reducers/CollapsedReducer.js
// reducer 接收两个参数：
// 第一个为当前保存在 store 中的数据（prevState）
// 第二个 action 是一个容器，包含 type（不可缺省）和 payload（可缺省）
export const CollapsedReducer = (prevState = {
  // 因为第一次的数据为 null，可以设置并初始化默认值
  isCollapsed: false
}, action) => {
  // 从 action 中解构出两个参数
  // type 是传递给 reducer 的值，reducer 根据不同的 type 值去执行不同的修改 state 的行为
  // payload 是一个对象，用于 action 携带数据的载体
  let { type, payload } = action;

  // action 不能直接赋值，需要深拷贝再 return 处理好的数据
  switch (type) {
    case "CHANGE_COLLAPSED": // 根据 case 值处理相应的数据
      let newState = { ...prevState };
      newState.isCollapsed = !newState.isCollapsed;
      return newState;
    default: // 都不满足直接返回原数据
      return prevState;
  }
};
```

### Provider 配置（App.js）

```js
// App.js
// 引入 react-redux 中的 Provider，搭配 connect 使用，包裹整个 App 容器
import { Provider } from 'react-redux';
// 引入自己封装的 store
import store from './redux/store';

export default function App() {
  return (
    // 包裹整个 App，将 store 传给组件
    <Provider store={store}>
      <IndexRouter /> // 这里包裹的是路由组件
    </Provider>
  );
}
```

### Connect 连接组件

```js
// 引入与 Provider 搭配使用的 connect
import { connect } from 'react-redux';
// 高阶组件，作用为将一个组件包裹进 Route 里
// 然后 react-router 的三个对象都会放进这个组件的 props 属性中
import { withRouter } from 'react-router-dom';

function TopHeader(props) {
  // ...
  const changeCollapsed = () => {
    props.changeCollapsed(); // 响应事件
  };
  // 用 props 中的数据直接引用 state 即可
  // ...
}

// 将需要的 state 的节点注入到与此视图数据相关的组件上
// 注入与绑定不一定在一个组件上，根据实际需求即可
const mapStateToProps = ({ CollapsedReducer: { isCollapsed } }) => {
  return { isCollapsed }; // 解构出 store，可直接用
  // 只有一行可以省略 return，但是大括号外要加小括号，否则会被当成对象
};

// 将需要绑定的响应事件注入到组件上
const mapDispatchToProps = {
  changeCollapsed() {
    return {
      type: 'CHANGE_COLLAPSED', // 一般定义为字符串常量
      // payload: {} // 所需要传递的数据
    }; // action
  }
};

// 在导出的地方加上 connect 即可使用
export default connect(mapStateToProps, mapDispatchToProps)(withRouter(TopHeader));
```

<!-- 如果需要响应的事件不在组件内部，就可以使用原始方法 -->

```js
import { store } from '../封装的redux路径';

// ...
store.dispatch({
  type: 'CHANGE_XXX',
  payload: true // 传递的数据
});
```

---

## Redux 持久化（Redux Persist）

`Redux` 是一个状态管理器，页面刷新 `redux` 数据就会丢失，所以我们可以使用 `redux-persist` 来维持 `redux` 的数据。

```bash
yarn add redux-persist
```

### Store 配置修改

```js
import { createStore, combineReducers } from "redux";
import { persistStore, persistReducer } from 'redux-persist';
// 存储的位置，可换成 localStorage，当前使用 sessionStorage
import storageSession from 'redux-persist/lib/storage/session';
import { devToolsEnhancer } from "redux-devtools-extension"; // redux 扩展工具（可选）

const persistConfig = {
  key: 'root', // 存储在本地的 key
  storage: storageSession, // 存放位置
  // blacklist: ['不保持持久化'], // 黑名单
  // whitelist: ['保持持久化'] // 白名单
};

const reducer = combineReducers({
  // 导入的 reducer
});

const persistedReducer = persistReducer(persistConfig, reducer); // 包装 reducer

const store = createStore(
  persistedReducer,
  devToolsEnhancer // redux 扩展工具
);

const persistor = persistStore(store); // 持久化存储

export { store, persistor }; // 导出
```

### 在 App.js/Index.js 中使用

```js
import { store, persistor } from './redux/store';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

// 包裹整个根组件即可
export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <根组件 />
      </PersistGate>
    </Provider>
  );
}
```

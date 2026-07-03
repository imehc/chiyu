---
title: 'React 生态核心笔记 - Redux 与 Router'
date: '2021-08-26 10:47'
tags: ['React']
draft: false
summary: 'React 状态管理方案详解：Redux 基础、Redux-Thunk 异步处理、Redux-Saga 中间件、React-Redux 连接器的使用与配置'
---

## Redux 基础

{/* truncate */}

### 安装 Redux

```bash
yarn add redux
```

在 `src` 目录下新建 `store` 文件夹，在 `store` 文件夹下新建 `index.js` 和 `reducer.js`。

### Store 配置（index.js）

```jsx
import { createStore } from "redux";
import reducer from "./reducer";

// 配置 Redux DevTools 插件
const tools = window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__();

// 创建数据仓库，第二个参数为插件配置
const store = createStore(reducer, tools);

export default store;
```

### Reducer 配置（reducer.js）

```jsx
const defaultState = {}; // 写默认数据的地方

// state 为原始仓库的状态，action 为 action 新传入的状态
// action 包含两个参数：type（固定字段）和 value（自定义的字段）
export default (state = defaultState, action) => {
  // 这里写更新 state 的状态，不能直接更改 state，需要深拷贝
  // 再把新的值 return 出去
  return state;
};
```

### 组件中使用 Redux

#### 发送 Action（Test.js）

```jsx
import store from './store'; // 需要配置正确的路径

// ...

changeInputValue(e) {
  // action 接收两个参数：类型（type）和数据（value）
  // value 为自定义的字段，可随意更换字段名
  // type 为固定字段，不可更改
  let action = {
    type: "change_input_value",
    value: e.target.value
  };
  
  store.dispatch(action); // 传递给 store
}

// ...
```

#### 获取 State（TestDemo.js）

```jsx
import store from './store';

// ...

constructor(props) {
  super(props);
  this.state = store.getState(); // 获取 Redux 中的值
}

// ...
```

#### 订阅状态变化

```jsx
// 订阅状态，提交 action 使用，写在 constructor 中
store.subscribe(() => this.setState(store.getState()));
```

### 代码组织技巧

#### 技巧 1：Action 类型统一管理

{/* 类型可以放在一个单独的文件管理，方便统一维护 */}

```jsx
// store/actionTypes.js
export const CHANGE_INPUT = 'changeInput';
export const ADD_ITEM = 'addItem';
export const DELETE_ITEM = 'deleteItem';
```

#### 技巧 2：Action Creator 统一管理

{/* action 提交也可以放到一个文件统一管理，提高可读性 */}

```jsx
// store/actionCreators.js
import { CHANGE_INPUT, ADD_ITEM, DELETE_ITEM } from "./actionTypes";

// 用箭头函数的方式存储类型和参数
const changeInputAction = (value) => ({
  type: CHANGE_INPUT,
  value,
});

const addItemAction = () => ({
  type: ADD_ITEM,
});

const deleteItemAction = (index) => ({
  type: DELETE_ITEM,
  index,
});

export { changeInputAction, addItemAction, deleteItemAction };
```

---

## Redux-Thunk 中间件

{/* 
dispatch 的加强，中间件可以做：
- 日志记录
- 创建崩溃报告
- 调用异步接口
- 路由处理
*/}

### 安装

```bash
yarn add redux-thunk
```

### 配置步骤

#### 1. 引入 `applyMiddleware` 和 `compose`

{/* 如果使用中间件，就必须引入 applyMiddleware */}
{/* compose：增强函数，用于组合多个增强器 */}

```jsx
import { createStore, applyMiddleware, compose } from 'redux';
```

#### 2. 引入 `redux-thunk`

```jsx
import thunk from 'redux-thunk';
```

#### 3. 创建 Store

```jsx
import reducer from "./reducer";

// 使用 Redux DevTools 的 compose 增强器
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
  ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({})
  : compose;

const enhancer = composeEnhancers(applyMiddleware(thunk));

const store = createStore(reducer, enhancer); // 创建数据存储仓库

export default store;
```

### 异步 Action Creator

配置完成后，可以在 `actionCreators.js` 中直接发送 `axios` 请求：

```jsx
import axios from 'axios';

// 同步 action
const getListAction = (data) => ({
  type: GET_LIST,
  data,
});

// 异步 action（返回函数而不是对象）
export const getTodoList = () => {
  return (dispatch) => {
    axios
      .get(`https://api.example.com/data`)
      .then((res) => {
        dispatch(getListAction(res.data.data));
      });
  };
};
```

---

## Redux-Saga 中间件

{/* Redux-Saga 是一个用于管理 Redux 应用副作用（如数据获取、订阅等）的库 */}

### 安装

```bash
yarn add redux-saga
```

插件地址：https://github.com/redux-saga/redux-saga

### Store 配置（index.js）

```jsx
import { createStore, applyMiddleware, compose } from "redux";
import createSagaMiddleware from 'redux-saga';   // 引入 saga
import reducer from "./reducer";

// 创建 saga 中间件
const sagaMiddleware = createSagaMiddleware();

// 使用 Redux DevTools 的 compose 增强器
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
  ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({})
  : compose;

const enhancer = composeEnhancers(applyMiddleware(sagaMiddleware));

const store = createStore(reducer, enhancer); // 创建数据仓库

export default store;
```

### Saga 配置（sagas.js）

```jsx
// store/sagas.js
import axios from "axios";
import { takeEvery, put } from "redux-saga/effects";
import { getListAction } from "./actionCreators";
import { GET_MY_LIST } from "./actionTypes";

// Generator 函数
function* mySaga() {
  // 等待捕获 action
  yield takeEvery(GET_MY_LIST, getList);
}

function* getList() {
  const res = yield axios.get("https://api.example.com/data");
  const action = getListAction(res.data.data);
  yield put(action); // 派发 action
}

export default mySaga;
```

### 启动 Saga

```jsx
// store/index.js
import mySagas from './sagas';

// 配置完就可以编写中间件了，具体配置查看官方文档
sagaMiddleware.run(mySagas);
```

---

## React-Redux 连接器

{/* 简化 Redux 流程，提供 Provider 和 connect 两个核心 API */}

### 安装

```bash
yarn add react-redux
```

### Provider 提供器

{/* Provider 用于将 Redux store 注入到 React 组件树中 */}

```jsx
import React from 'react';
import ReactDOM from 'react-dom';
import TodoList from './TodoList';
import { Provider } from 'react-redux';
import store from './store';

// 声明一个 App 组件，然后用 Provider 进行包裹
const App = (
  <Provider store={store}>
    <TodoList />
  </Provider>
);

ReactDOM.render(App, document.getElementById('root'));
```

### Connect 连接器

{/* connect 用于连接 React 组件和 Redux store */}

```jsx
import { connect } from 'react-redux';  // 引入连接器
```

#### 定义映射函数

```jsx
// 将 state 映射到 props
const stateToProps = (state) => {
  return {
    inputValue: state.inputValue,
    list: state.list,
  };
};

// 将 dispatch 映射到 props
const dispatchToProps = (dispatch) => {
  return {
    inputChange(e) {
      let action = {
        type: "change_input",
        value: e.target.value,
      };
      dispatch(action); // 派发 action
    },
    clickButton() {
      let action = {
        type: "add_item",
      };
      dispatch(action);
    },
  };
};
```

#### 导出连接后的组件

```jsx
export default connect(stateToProps, dispatchToProps)(TodoList);
// 第一个参数为 stateToProps，第二个为 dispatchToProps
```

---

## React Router

{/* React 官方推荐的路由解决方案 */}

（内容待补充...）

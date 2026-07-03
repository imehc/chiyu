---
title: 'Vuex 核心知识详解'
date: '2026-01-20'
tags: ['Vue', 'JavaScript']
draft: false
summary: 'Vuex 五大核心概念详解：State、Getter、Mutation、Action、Module 的使用方法与最佳实践'
---

## Vuex 概述

五个核心：`state`、`getter`、`mutation`、`action`、`module`

{/* truncate */}

---

## State

{/* 单一状态树，页面显示所需的数据从该对象中进行读取。 */}

### 基础配置

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex) // Vue 的插件机制

// Vuex.Store 构造器选项
const store = new Vuex.Store({
  state: { // 存放状态
    "username": "foo",
    "age": 18
  }
})

export default store
```

```js
// 页面路径：main.js
import Vue from 'vue'
import App from './App'
import store from './store'

Vue.prototype.$store = store

// 把 store 对象提供给 "store" 选项，这可以把 store 的实例注入所有的子组件
const app = new Vue({
  store,
  ...App
})

app.$mount()
```

### 获取 State

#### 1. 通过属性访问

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <text>用户名：{{ username }}</text>
  </view>
</template>

<script>
import store from '@/store/index.js' // 需要引入 store

export default {
  data() {
    return {}
  },
  computed: {
    username() {
      return store.state.username
    }
  }
}
</script>
```

#### 2. 通过 `this.$store` 访问

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <text>用户名：{{ username }}</text>
  </view>
</template>

<script>
export default {
  data() {
    return {}
  },
  computed: {
    username() {
      return this.$store.state.username
    }
  }
}
</script>
```

#### 3. 通过 `mapState` 辅助函数获取

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>用户名：{{ username }}</view>
    <view>年龄：{{ age }}</view>
  </view>
</template>

<script>
import { mapState } from 'vuex' // 引入 mapState

export default {
  data() {
    return {}
  },
  computed: mapState({
    // 从 state 中拿到数据，箭头函数可使代码更简练
    username: state => state.username,
    age: state => state.age
  })
}
</script>
```

{/* 当映射的计算属性与 state 的子节点名称相同，可以简写 */}

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>用户名：{{ username }}</view>
    <view>年龄：{{ age }}</view>
  </view>
</template>

<script>
import { mapState } from 'vuex' // 引入 mapState

export default {
  data() {
    return {}
  },
  computed: mapState([
    'username', // 映射 this.username 为 store.state.username
    'age'
  ])
}
</script>
```

{/* 为了能够使用 this 获取组件自己的 data 数据，必须使用常规函数 */}

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>用户名：{{ username }}</view>
    <view>年龄：{{ age }}</view>
  </view>
</template>

<script>
import { mapState } from 'vuex' // 引入 mapState

export default {
  data() {
    return {
      firstName: "Li"
    }
  },
  computed: {
    ...mapState({
      username: function (state) {
        return this.firstName + ' ' + state.username
      },
      age: state => state.age
    })
  }
}
</script>
```

{/* 使用对象展开运算符 */}

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>用户名：{{ username }}</view>
    <view>年龄：{{ age }}</view>
  </view>
</template>

<script>
import { mapState } from 'vuex' // 引入 mapState

export default {
  data() {
    return {}
  },
  computed: {
    // 使用对象展开运算符将此对象混入到外部对象中
    ...mapState({
      username: state => state.username,
      age: state => state.age
    })
  }
}
</script>
```

---

## Getter

{/* 可以认为是 store 的计算属性，对 state 的加工，是派生出来的数据 */}

{/* 在 store 上注册 getter，getter 接收以下参数：
     state，如果在模块中定义则为模块的局部状态
     getter，等同于 store.getters */}

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    todos: [
      { id: 1, text: '我是内容一', done: true },
      { id: 2, text: '我是内容二', done: false }
    ]
  },
  getters: {
    doneTodos: state => {
      return state.todos.filter(todo => todo.done)
    },
    doneTodosCount: (state, getters) => {
      // state：可以访问数据
      // getters：访问其他函数，等同于 store.getters
      return getters.doneTodos.length
    },
    getTodoById: (state) => (id) => {
      return state.todos.find(todo => todo.id === id)
    }
  }
})

export default store
```

### 获取 Getters

#### 1. 通过属性访问

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view v-for="(item, index) in todos" :key="index">
      <view>{{ item.id }}</view>
      <view>{{ item.text }}</view>
      <view>{{ item.done }}</view>
    </view>
  </view>
</template>

<script>
import store from '@/store/index.js' // 需要引入 store

export default {
  computed: {
    todos() {
      return store.getters.doneTodos
    }
  }
}
</script>
```

{/* getter 在通过属性访问时是作为 Vue 的响应式的一部分缓存其中的 */}

#### 2. 通过 `this.$store` 访问

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view v-for="(item, index) in todos" :key="index">
      <view>{{ item.id }}</view>
      <view>{{ item.text }}</view>
      <view>{{ item.done }}</view>
    </view>
  </view>
</template>

<script>
export default {
  computed: {
    todos() {
      return this.$store.getters.doneTodos
    }
  }
}
</script>
```

#### 3. 通过方法访问

{/* 通过让 getter 返回一个函数，来实现给 getter 传参，这对 store 里的数组进行查询是非常有用的。
     注意：通过方法访问，不会缓存结果 */}

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view v-for="(item, index) in todos" :key="index">
      <view>{{ item }}</view>
    </view>
  </view>
</template>

<script>
export default {
  computed: {
    todos() {
      return this.$store.getters.getTodoById(2)
    }
  }
}
</script>
```

#### 4. 通过 `mapGetters` 辅助函数访问

{/* mapGetters 辅助函数仅仅是将 store 中的 getter 映射到局部计算属性 */}

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>{{ doneTodosCount }}</view>
  </view>
</template>

<script>
import { mapGetters } from 'vuex' // 引入 mapGetters

export default {
  computed: {
    // 使用对象展开运算符将 getter 混入 computed 对象中
    ...mapGetters([
      'doneTodos',
      'doneTodosCount'
      // ...
    ])
  }
}
</script>
```

{/* 如果你想将一个 getter 属性另取一个名字，使用对象形式 */}

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>{{ doneCount }}</view>
  </view>
</template>

<script>
import { mapGetters } from 'vuex' // 引入 mapGetters

export default {
  computed: {
    ...mapGetters({
      // 把 `this.doneCount` 映射为 `this.$store.getters.doneTodosCount`
      doneCount: 'doneTodosCount'
    })
  }
}
</script>
```

---

## Mutation

{/* Vuex 中 store 数据改变的唯一方法就是 mutation */}

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state) {
      // 变更状态
      state.count += 2
    }
  }
})

export default store
```

{/* 不能直接调用一个 mutation handler，这个选项更像是事件注册。
     当触发一个类型为 add 的 mutation 时，调用此函数。
     要唤醒一个 mutation handler，需要以相应的 type 调用 store.commit 方法。 */}

### 调用 Mutation

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="addCount">增加</button>
  </view>
</template>

<script>
import store from '@/store/index.js'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    addCount() {
      store.commit('add')
    }
  }
}
</script>
```

### 传入参数

{/* 你可以向 store.commit 传入额外的参数，即 mutation 的载荷（payload） */}

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state, n) {
      state.count += n
    }
  }
})

export default store
```

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="addCount">增加</button>
  </view>
</template>

<script>
import store from '@/store/index.js'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    addCount() {
      store.commit('add', 5) // 每次累加 5
    }
  }
}
</script>
```

{/* 在 mutation 传参（载荷）也可以传递一个对象 */}

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state, payload) {
      state.count += payload.amount
    }
  }
})

export default store
```

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="addCount">增加</button>
  </view>
</template>

<script>
import store from '@/store/index.js'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    addCount() {
      // 把载荷和 type 分开提交
      store.commit('add', { amount: 10 })
    }
  }
}
</script>
```

### 提交方式

#### 1. 对象风格的提交方式

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="addCount">增加</button>
  </view>
</template>

<script>
import store from '@/store/index.js'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    addCount() {
      // 整个对象都作为载荷传给 mutation 函数
      store.commit({
        type: 'add',
        amount: 6
      })
    }
  }
}
</script>
```

{/* 当使用对象风格的提交方式，整个对象都作为载荷传给 mutation 函数，因此 handler 保持不变 */}

```js
mutations: {
  add(state, payload) {
    state.count += payload.amount
  }
}
```

#### 2. 通过 `mapMutations` 辅助函数提交

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="add">增加</button>
  </view>
</template>

<script>
import { mapMutations } from 'vuex' // 引入 mapMutations

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    ...mapMutations(['add']) // 对象展开运算符直接拿到 add
  }
}
</script>
```

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state) {
      // 变更状态
      state.count += 2
    }
  }
})

export default store
```

{/* 以新对象替换对象，可以使用展开运算符 */}

```js
state.obj = { ...state.obj, newProp: 123 }
```

{/* Mutation 必须是同步函数 */}

---

## Action

{/* action 类似于 mutation。
     action 提交的是 mutation，通过 mutation 来改变 state，而不是直接改变状态。
     action 可以包含任意异步操作。
     通俗来说，就是 mutation 处理同步，action 处理异步 */}

### 注册 Action

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state) {
      // 变更状态
      state.count += 2
    }
  },
  actions: {
    addCountAction(context) {
      context.commit('add')
    }
  }
})

export default store
```

{/* action 函数接受一个与 store 实例具有相同方法和属性的 context 对象，
     因此你可以调用 context.commit 提交一个 mutation，
     或者通过 context.state 和 context.getters 来获取 state 和 getters。 */}

{/* 可以通过 ES6+ 语法的参数解构来简化代码 */}

```js
actions: {
  // 参数解构
  addCountAction({ commit }) {
    commit('add')
  }
}
```

### 分发 Action

#### 1. Actions 通过 `store.dispatch` 方法触发

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="add">增加</button>
  </view>
</template>

<script>
import store from '@/store/index.js'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    add() {
      store.dispatch('addCountAction')
    }
  }
}
</script>
```

{/* action 支持以载荷形式分发 */}

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state, payload) {
      state.count += payload.amount
    }
  },
  actions: {
    addCountAction(context, payload) {
      context.commit('add', payload)
    }
  }
})

export default store
```

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="add">增加</button>
  </view>
</template>

<script>
import store from '@/store/index.js'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    add() {
      // 以载荷形式分发
      store.dispatch('addCountAction', { amount: 10 })
    }
  }
}
</script>
```

{/* action 支持以对象形式分发 */}

```js
methods: {
  add() {
    // 以对象形式分发
    store.dispatch({
      type: 'addCountAction',
      amount: 5
    })
  }
}
```

{/* action 可以执行任意的同步和异步操作 */}

```js
// 页面路径：store/index.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 1
  },
  mutations: {
    add(state) {
      // 变更状态
      state.count += 2
    }
  },
  actions: {
    addCountAction(context) {
      // 在执行累加的时候，会等待两秒才执行
      setTimeout(function () {
        context.commit('add')
      }, 2000)
    }
  }
})

export default store
```

#### 2. 通过 `mapActions` 辅助函数分发

```js
// 页面路径：pages/index/index.vue
<template>
  <view>
    <view>数量：{{ count }}</view>
    <button @click="addCountAction">增加</button>
  </view>
</template>

<script>
import { mapActions } from 'vuex'

export default {
  computed: {
    count() {
      return this.$store.state.count
    }
  },
  methods: {
    ...mapActions([
      'addCountAction'
      // 将 `this.addCountAction()` 映射为 `this.$store.dispatch('addCountAction')`
    ])
  }
}
</script>
```

{/* mapActions 也支持传入参数（载荷） */}

```js
methods: {
  ...mapActions([
    'addCountAction'
    // 将 `this.addCountAction(amount)` 映射为
    // `this.$store.dispatch('addCountAction', amount)`
  ])
}
```

{/* mapActions 也支持传递一个对象 */}

```js
methods: {
  ...mapActions({
    addCount: 'addCountAction'
    // 将 `this.addCount()` 映射为 `this.$store.dispatch('addCountAction')`
  })
}
```

### 组合 Action

{/* store.dispatch 可以处理被触发的 action 的处理函数返回的 Promise，
     并且 store.dispatch 仍旧返回 Promise */}

```js
actions: {
  actionA({ commit }) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        commit('someMutation')
        resolve()
      }, 1000)
    })
  }
}
```

{/* 现在你可以在组件中使用 */}

```js
store.dispatch('actionA').then(() => {
  // ...
})
```

{/* 在另外一个 action 中也可以 */}

```js
actions: {
  // ...
  actionB({ dispatch, commit }) {
    return dispatch('actionA').then(() => {
      commit('someOtherMutation')
    })
  }
}
```

{/* 最后，如果我们利用 async / await，我们可以如下组合 action */}

```js
// 假设 getData() 和 getOtherData() 返回的是 Promise
actions: {
  async actionA({ commit }) {
    commit('gotData', await getData())
  },
  async actionB({ dispatch, commit }) {
    await dispatch('actionA') // 等待 actionA 完成
    commit('gotOtherData', await getOtherData())
  }
}
```

{/* 一个 store.dispatch 在不同模块中可以触发多个 action 函数。
     在这种情况下，只有当所有触发函数完成后，返回的 Promise 才会执行。 */}

---

## Module

{/* 将 store 分割成模块。每个模块拥有自己的 state、mutation、action、getter、
     甚至是嵌套子模块——从上至下进行同样方式的分割 */}

参考文档：https://uniapp.dcloud.io/vue-vuex?id=module

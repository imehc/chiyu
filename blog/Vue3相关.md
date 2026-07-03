---
title: 'Vue3 核心知识详解'
date: '2021-08-10 17:53'
tags: ['Vue', 'JavaScript']
draft: false
summary: 'Vue3 组合式 API、响应式原理、生命周期、新特性等核心知识点整理'
---

## Vue3 的响应式

实现原理：
- 通过 `Proxy`（代理）：拦截对象中任意属性的变化，包括：属性值的读写、属性的添加、属性的删除等。
- 通过 `Reflect`（反射）：对代理对象的属性进行操作。

{/* truncate */}

MDN 文档中描述的 `Proxy` 与 `Reflect`：
- `Proxy`：https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Proxy
- `Reflect`：https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Reflect

```js
new Proxy(data, {
  // 拦截读取属性
  get(target, prop) {
    return Reflect.get(target, prop)
  },
  // 拦截设置属性值或添加新属性
  set(target, prop, value) {
    return Reflect.set(target, prop, value)
  },
  deleteProperty(target, prop) {
    return Reflect.deleteProperty(target, prop)
  }
})
```

## `reactive` 对比 `ref`

从定义数据角度对比：
- `ref` 用来定义：**基本数据类型**
- `reactive` 用来定义：**对象（或数组）类型数据**

备注：`ref` 也可以用来定义**对象（或数组）类型数据**，它会自动通过 `reactive` 转为代理对象。

从原理角度对比：
- `ref` 通过 `Object.defineProperty()` 的 `get` 和 `set` 来实现响应式（数据劫持）。
- `reactive` 通过使用 **Proxy** 来实现响应式（数据劫持），并通过 **Reflect** 操作源对象内部的数据。

从使用角度对比：
- `ref` 定义的数据：操作数据需要 `.value`，读取数据时模板中直接读取不需要 `.value`。
- `reactive` 定义的数据：操作数据与读取数据均不需要 `.value`。

## `setup` 的两个注意点

### `setup` 执行时机

在 `beforeCreate` 之前执行一次，此时 `this` 是 `undefined`。

### `setup` 的参数

- `props`：值为对象，包含组件外部传递过来，且组件内部声明接收了的属性。
- `context`：上下文对象
  - `attrs`：值为对象，包含组件外部传递过来，但没有在 `props` 配置中声明的属性，相当于 `this.$attrs`。
  - `slots`：收到的插槽内容，相当于 `this.$slots`。
  - `emit`：分发自定义事件的函数，相当于 `this.$emit`。

## 计算属性与监视

### `computed` 函数

与 Vue2.x 中 `computed` 配置功能一致。

```js
import { computed } from 'vue'

setup() {
  // 计算属性简写
  let fullName = computed(() => {
    return person.firstName + '-' + person.lastName
  })

  // 计算属性完整写法
  let fullName = computed({
    get() {
      return person.firstName + '-' + person.lastName
    },
    set(value) {
      let nameArr = value.split('-')
      person.firstName = nameArr[0]
      person.lastName = nameArr[1]
    }
  })
}
```

## `watch` 函数

与 Vue2.x 中 `watch` 配置功能一致。

两个小坑：
1. 监视 `reactive` 定义的响应式数据时：`oldValue` 无法正确获取、强制开启了深度监视（`deep` 配置失效）。
2. 监视 `reactive` 定义的响应式数据中某个属性时：`deep` 配置有效。

```js
import { ref, reactive, watch } from 'vue'

let sum = ref(0)
let msg = ref('你好')
let person = reactive({
  name: '张三',
  age: 18
})

// 情况一：监视 ref 定义的响应式数据
watch(sum, (newValue, oldValue) => {
  console.log('sum 变化了', newValue, oldValue)
}, { immediate: true })

// 情况二：监视多个 ref 定义的响应式数据
watch([sum, msg], (newValue, oldValue) => {
  console.log('sum 或 msg 变化了', newValue, oldValue)
})

/* 
情况三：监视 reactive 定义的一个响应式数据
- 若 watch 监视的是 reactive 定义的响应式数据，则无法正确获得 oldValue！！
- 若 watch 监视的是 reactive 定义的响应式数据，则强制开启了深度监视
*/
watch(person, (newValue, oldValue) => {
  console.log('person 变化了', newValue, oldValue)
}, { deep: false }) // 此处的 deep 配置无效

// 情况四：监视 reactive 定义的一个响应式数据中的某个属性
watch(() => person.name, (newValue, oldValue) => {
  console.log('person.name 变化了', newValue, oldValue)
})

// 情况五：监视 reactive 定义的一个响应式数据中的某些属性
watch([() => person.name, () => person.age], (newValue, oldValue) => {
  console.log('person 的 name 或 age 变化了', newValue, oldValue)
})

// 特殊情况
watch(() => person.job, (newValue, oldValue) => {
  console.log('person.job 变化了', newValue, oldValue)
}, { deep: true }) // 此处由于监视的是 reactive 中定义的对象中的某个属性，所以 deep 配置有效
```

## `watchEffect`

- `watch`：既要指明监视的属性，也要指明监视的回调。
- `watchEffect`：不用指明监视哪个属性，监视的回调中用到哪个属性，那就监视哪个属性。

`watchEffect` 有点像 `computed`：
- 但 `computed` 注重计算出来的值（回调函数的返回值），所以必须要写返回值。
- 而 `watchEffect` 更注重的是过程（回调函数的函数体），所以不用写返回值。

```js
// watchEffect 所指定的回调中用到的数据只要发生变化，则直接重新执行回调
watchEffect(() => {
  const x1 = sum.value
  const x2 = person.age
  console.log('watchEffect 配置的回调执行了')
})
```

## 生命周期

Vue3.0 中可以继续使用 Vue2.x 中的生命周期钩子，但有两个被更名：

- `beforeDestroy` → `beforeUnmount`
- `destroyed` → `unmounted`

Vue3.0 也提供了 Composition API 形式的生命周期钩子，与 Vue2.x 中钩子对应关系如下：

| Vue2.x | Vue3.0 Composition API |
|--------|------------------------|
| `beforeCreate` | `setup()` |
| `created` | `setup()` |
| `beforeMount` | `onBeforeMount` |
| `mounted` | `onMounted` |
| `beforeUpdate` | `onBeforeUpdate` |
| `updated` | `onUpdated` |
| `beforeUnmount` | `onBeforeUnmount` |
| `unmounted` | `onUnmounted` |

## 自定义 Hook 函数

什么是 hook？—— 本质是一个函数，把 `setup` 函数中使用的 Composition API 进行了封装。

类似于 Vue2.x 中的 `mixin`。

自定义 hook 的优势：复用代码，让 `setup` 中的逻辑更清楚易懂。

## `toRef`

作用：创建一个 `ref` 对象，其 `value` 值指向另一个对象中的某个属性值。

语法：`const name = toRef(person, 'name')`

应用：要将响应式对象中的某个属性单独提供给外部使用时。

扩展：`toRefs` 与 `toRef` 功能一致，但可以批量创建多个 `ref` 对象，语法：`...toRefs(person)`

## 其它 Composition API

### 1. `shallowReactive` 与 `shallowRef`

- `shallowReactive`：只处理对象最外层属性的响应式（浅响应式）。
- `shallowRef`：只处理基本数据类型的响应式，不进行对象的响应式处理。

什么时候用？
- 如果有一个对象数据，结构比较深，但变化时只是外层属性变化 → 使用 `shallowReactive`
- 如果有一个对象数据，后续功能不会修改该对象中的属性，而是生成新的对象来替换 → 使用 `shallowRef`

### 2. `readonly` 与 `shallowReadonly`

- `readonly`：让一个响应式数据变为只读的（深只读）。
- `shallowReadonly`：让一个响应式数据变为只读的（浅只读）。

应用场景：不希望数据被修改时。

```js
person = shallowReadonly(person)
```

### 3. `toRaw` 与 `markRaw`

**`toRaw`**：
- 作用：将一个由 `reactive` 生成的响应式对象转为普通对象。
- 使用场景：用于读取响应式对象对应的普通对象，对这个普通对象的所有操作，不会引起页面更新。

```js
const p = toRaw(person)
```

**`markRaw`**：
- 作用：标记一个对象，使其永远不会再成为响应式对象。
- 应用场景：
  1. 有些值不应被设置为响应式的，例如复杂的第三方类库等。
  2. 当渲染具有不可变数据源的大列表时，跳过响应式转换可以提高性能。

```js
person.car = markRaw(car)
```

### 4. `customRef`

作用：创建一个自定义的 `ref`，并对其依赖跟踪和更新触发进行显式控制。

实现防抖效果：

```vue
<template>
  <input type="text" v-model="keyWord">
  <h3>{{ keyWord }}</h3>
</template>

<script>
import { customRef } from 'vue'

export default {
  setup() {
    // 自定义一个 ref，名为：myRef
    function myRef(value, delay) {
      let timer
      return customRef((track, trigger) => {
        return {
          get() {
            track() // 通知 Vue 追踪 value 的变化
            return value
          },
          set(val) {
            clearTimeout(timer)
            timer = setTimeout(() => {
              value = val
              trigger() // 通知 Vue 去重新解析模板
            }, delay)
          }
        }
      })
    }

    // let keyWord = ref('hello') // 使用 Vue 提供的 ref
    let keyWord = myRef('hello', 500) // 自定义的 ref

    return {
      keyWord
    }
  }
}
</script>
```

### 5. `provide` 与 `inject`

作用：实现祖孙组件间通信。

套路：父组件有一个 `provide` 选项来提供数据，子组件有一个 `inject` 选项来使用这些数据。

具体写法：

**1. 祖组件中：**

```js
setup() {
  let car = reactive({ name: '特斯拉', price: '20w' })
  provide('car', car)
  // ...
}
```

**2. 孙组件中：**

```js
setup() {
  let car = inject('car')
  return { car }
  // ...
}
```

### 6. 响应式数据的判断

- `isRef`：检查一个值是否为一个 `ref` 对象
- `isReactive`：检查一个对象是否由 `reactive` 创建的响应式代理
- `isReadonly`：检查一个对象是否由 `readonly` 创建的只读代理
- `isProxy`：检查一个对象是否由 `reactive` 或者 `readonly` 方法创建的代理

## 新的组件

### 1. `Fragment`

在 Vue2 中：组件只能有一个根标签。

在 Vue3 中：组件可以没有根标签，内部会将多个标签包含在一个 `Fragment` 虚拟元素中。

好处：减少标签层级，减少内存占用。

### 2. `Teleport`

`Teleport` 是一种能够将我们的组件 HTML 结构移动到指定位置的技术。

```html
<teleport to="移动位置【标签，CSS 选择器】">
  <div v-if="isShow" class="mask">
    <h3>我是一个弹窗</h3>
  </div>
</teleport>
```

### 3. `Suspense`（实验阶段）

等待异步组件时渲染一些额外内容，获得更好的用户体验。

使用步骤：

1. 异步引入组件：

```js
import { defineAsyncComponent } from 'vue'
const Child = defineAsyncComponent(() => import('./components/Child.vue'))
```

2. 使用 `Suspense` 包裹组件，并配置好 `default` 与 `fallback`：

```vue
<template>
  <div class="app">
    <h3>我是 App 组件</h3>
    <Suspense>
      <template #default>
        <Child />
      </template>
      <template #fallback>
        <h3>加载中...</h3>
      </template>
    </Suspense>
  </div>
</template>
```

## 其它变更

Vue3.0 中对这些 API 做出了调整：

### 全局 API 调整

将全局的 API，即 `Vue.xxx` 调整到应用实例（`app`）上：

| 2.x 全局 API (`Vue`) | 3.x 全局 API (`app`) |
|---------------------|---------------------|
| `Vue.config.xxx` | `app.config.xxx` |
| `Vue.config.productionTip`（关闭 Vue 生产提示） | 移除 |
| `Vue.component` | `app.component` |
| `Vue.directive` | `app.directive` |
| `Vue.mixin` | `app.mixin` |
| `Vue.use` | `app.use` |
| `Vue.prototype` | `app.config.globalProperties` |

### 其它改变

- `data` 选项应始终被声明为一个函数。

- 过渡类名的更改：

  **Vue2.x 写法：**
  ```css
  .v-enter,
  .v-leave-to {
    opacity: 0;
  }
  .v-leave,
  .v-enter-to {
    opacity: 1;
  }
  ```

  **Vue3.x 写法：**
  ```css
  .v-enter-from,
  .v-leave-to {
    opacity: 0;
  }
  .v-leave-from,
  .v-enter-to {
    opacity: 1;
  }
  ```

- 移除 `keyCode` 作为 `v-on` 的修饰符，同时也不再支持 `config.keyCodes`。

- 移除 `v-on.native` 修饰符：

  父组件中绑定事件：
  ```vue
  <my-component 
    v-on:close="handleComponentEvent" 
    v-on:click="handleNativeClickEvent">
  </my-component>
  ```

  子组件声明自定义事件：
  ```js
  export default {
    emits: ['close']
  }
  ```

- 移除过滤器（`filter`）。

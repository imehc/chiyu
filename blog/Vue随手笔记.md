---
title: 'Vue 随手笔记'
date: '2021-07-29 10:10'
tags: ['Vue', 'JavaScript']
draft: false
summary: 'Vue 开发实用技巧：watch 监听器的完整用法、实例内与实例外配置、深度监听、简写形式及 npm 版本查询命令'
---

# Vue 随手笔记

<!-- truncate -->

## Watch 监听器

### 实例内配置

```js
watch: {
  isHot: {
    immediate: true, // 初始化调用一下 handler()，默认为 false
    handler(newValue, oldValue) {
      console.log(newValue, oldValue);
    },
  },
}
```

### 实例外配置

```js
vm.$watch('isHot', {
  // 实例外，关键字 $watch
  immediate: true, // 初始化调用一下 handler()，默认为 false
  handler(newValue, oldValue) {
    console.log(newValue, oldValue);
  },
});
```

### 深度监听

```js
watch: {
  // 实例内
  isHot: {
    immediate: true, // 初始化调用一下 handler()，默认为 false
    handler(newValue, oldValue) {
      console.log(newValue, oldValue);
    },
  },
  // 'numbers.a': {
  //   // 监视多级结构中某个属性的变化（不推荐）
  //   handler(newValue, oldValue) {
  //     console.log(newValue, oldValue);
  //   },
  // },
  numbers: {
    deep: true, // 开启深度监听（vue 提供的 watch 默认不支持检测对象内部值的改变）
    handler(newValue, oldValue) {
      console.log(newValue, oldValue);
    },
  },
}
```

### 简写形式

#### 实例内简写

```js
watch: {
  // 不需要设置初始化调用，以及深度监听等
  isHot(newValue, oldValue) {
    console.log(newValue, oldValue);
  },
}
```

#### 实例外简写

```js
vm.$watch('isHot', function (newValue, oldValue) {
  // 不能使用箭头函数，会影响 this 指向
  console.log(newValue, oldValue);
});
```

## NPM 技巧

### 查看插件的所有版本号

```bash
npm view '名称' versions
```
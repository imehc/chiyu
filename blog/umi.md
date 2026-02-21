---
title: 'Umi 框架快速上手与配置指南'
date: '2021-08-20 17:01'
tags: ['Umi', 'React']
draft: false
summary: 'Umi 企业级 React 应用框架的快速上手、CLI 创建项目、页面生成、开发服务器启动及运行时配置详解'
---

## Umi 概述

`Umi` 是一个可插拔的企业级 `React` 应用框架，基于 `React` 和 `dva` 构建，提供了开箱即用的工程化能力。

<!-- truncate -->

---

## 快速上手

### 1. 全局安装 Umi

```bash
yarn global add umi
```

### 2. 查看是否安装成功

```bash
umi -v
```

### 3. 创建项目目录

```bash
mkdir my-app
```

### 4. 创建页面

通过 `umi g page` 命令创建页面：

```bash
umi g page 名称
```

<!-- 使用 --typescript --less 来选择性地指定文件类型 -->

```bash
umi g page home --typescript --less
```

### 5. 启动开发服务器

```bash
umi dev
```

### 6. 访问应用

启动后打开 `http://localhost:8000/名称` 即可访问。

---

## 使用 CLI 创建初始化项目

### 安装 create-umi-app

```bash
yarn global add @umijs/create-umi-app
```

<!-- 在命令行输入 create-umi-app -v 查看版本号，判断是否安装成功 -->

### 创建新项目

```bash
mkdir myapp && cd myapp
```

```bash
create-umi-app
```

<!-- 如果命令行出现日志，说明新建项目完成 -->

或者使用 `yarn create` 一步完成：

```bash
yarn create @umijs/umi-app
```

### 安装依赖

```bash
yarn
```

### 启动开发服务器

```bash
yarn start
```

或

```bash
umi dev
```

---

## Umi 核心约定

### 全局布局

<!-- 存在 ./src/layouts/index 时，会自动使用它作为全局布局 -->

当项目存在 `./src/layouts/index.tsx`（或 `.jsx`）时，`Umi` 会自动将其作为全局布局组件包裹所有页面。

### 数据流（dva）

<!-- umi 中启动 dva 时，约定 ./src/models/ 目录下的 model 文件将被视为 model 模块 -->

`Umi` 集成 `dva` 作为数据流方案：

- 约定 `./src/models/` 目录下的文件自动注册为 `model`
- 页面中可通过 `connect` 或 `useModel` 访问 `state`

### 运行时配置

<!-- umi 的运行时配置，都在 src/app.ts 中 -->

`Umi` 的运行时配置统一在 `src/app.ts` 中管理：

```typescript
// src/app.ts
import { RequestConfig } from 'umi';

// 配置 umi-request 的请求拦截、响应拦截等
export const request: RequestConfig = {
  timeout: 1000,
  errorConfig: {},
  middlewares: [],
  requestInterceptors: [],
  responseInterceptors: [],
};
```

---

## 常用配置

### 基础配置（.umirc.ts）

```typescript
// .umirc.ts
import { defineConfig } from 'umi';

export default defineConfig({
  nodeModulesTransform: {
    type: 'none',
  },
  routes: [
    { path: '/', component: '@/pages/index' },
    { path: '/users', component: '@/pages/users' },
  ],
  fastRefresh: {},
  // 启用 dva
  dva: {
    hmr: true,
  },
  // 启用 antd
  antd: {},
  // 启用 less
  lessLoader: {
    javascriptEnabled: true,
  },
});
```

### 环境变量

```bash
# .env
PORT=8000
BABEL_POLYFILL=none
```

---

## 目录结构

```
my-app
├── .umirc.ts          # 配置文件
├── .env               # 环境变量
├── src
│   ├── app.ts         # 运行时配置
│   ├── layouts        # 布局目录
│   │   └── index.tsx  # 全局布局
│   ├── models         # dva models
│   │   └── user.ts
│   ├── pages          # 页面目录
│   │   ├── index.tsx
│   │   └── users.tsx
│   └── services       # API 服务
│       └── user.ts
├── package.json
└── tsconfig.json
```

---

## 部署构建

```bash
# 构建生产环境
umi build

# 分析构建结果
ANALYZE=1 umi build
```

构建产物默认输出到 `dist/` 目录。

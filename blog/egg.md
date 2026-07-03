---
title: 'Egg.js 企业级 Node.js 框架开发指南'
date: '2021-08-18 14:43'
tags: ['Node']
draft: false
summary: 'Egg.js 项目初始化、目录结构、Router 路由配置、View 模板渲染、Service 业务逻辑层、静态资源管理等核心开发指南'
---

## Egg.js 概述

`Egg.js` 是阿里开源的企业级 `Node.js` 框架，基于 `Koa` 开发，专为构建中大型应用设计，提供了一套完整的 `MVC` 架构解决方案。

{/* truncate */}

---

## 初始化项目

```bash
# 使用 npm
npm init egg --type=simple --registry=china

# 或者使用 yarn
yarn create egg --type=simple --registry=china
```

安装依赖：

```bash
npm i
# 或者
yarn
```

启动开发服务器：

```bash
npm run dev
```

---

## 项目目录结构

一个典型的 `Egg` 项目有如下目录结构：

```
egg-project
├── package.json
├── app.js (可选)
├── agent.js (可选)
├── app/
│   ├── router.js              # 用于配置 URL 路由规则
│   ├── controller/            # 用于存放控制器（解析用户的输入、加工处理、返回结果）
│   ├── model/ (可选)          # 用于存放数据库模型
│   ├── service/ (可选)        # 用于编写业务逻辑层
│   ├── middleware/ (可选)     # 用于编写中间件
│   ├── schedule/ (可选)       # 用于设置定时任务
│   ├── public/ (可选)         # 用于放置静态资源
│   ├── view/ (可选)           # 用于放置模板文件
│   └── extend/ (可选)         # 用于框架的扩展
│       ├── helper.js (可选)
│       ├── request.js (可选)
│       ├── response.js (可选)
│       ├── context.js (可选)
│       ├── application.js (可选)
│       └── agent.js (可选)
├── config/
│   ├── plugin.js              # 用于配置需要加载的插件
│   └── config.{env}.js        # 用于编写配置文件（env 可以是 default, prod, test, local, unittest）
```

---

## Router 路由配置

`app/router.js` 里面定义 `URL` 路由规则。

```js
// app/router.js
'use strict';

module.exports = app => {
  const { router, controller } = app;
  
  router.get('/', controller.home.index);
  // home: controller 文件夹下的文件名称
  // index: 文件夹下的某一个方法
};
```

---

## View 模板渲染

### 安装插件

```bash
npm i egg-view-ejs --save
```

{/* npm 地址：https://github.com/eggjs/egg-view-ejs */}

### 配置插件

```js
// {app_root}/config/plugin.js
exports.ejs = {
  enable: true,
  package: 'egg-view-ejs',
};
```

使用默认的导出，修改复制文件如下：

```js
"use strict";

/** @type Egg.EggPlugin */
module.exports = {
  // had enabled by egg
  // static: {
  //   enable: true,
  // }
  
  // {app_root}/config/plugin.js
  ejs: {
    enable: true,
    package: 'egg-view-ejs',
  },
};
```

### 配置视图引擎

```js
// {app_root}/config/config.default.js
exports.view = {
  mapping: {
    '.ejs': 'ejs',
  },
};
```

使用默认的导出，修改复制文件如下：

```js
module.exports = (appInfo) => {
  // ...
  
  // 关闭 CSRF
  config.security = {
    csrf: {
      enable: false,
    },
  };
  
  // {app_root}/config/config.default.js
  config.view = {
    mapping: {
      '.html': 'ejs',
    },
  };
  
  // ...
};
```

### 创建模板文件

在 `app` 目录下新建 `view` 文件夹，创建 `user.html`：

```html
{/* app/view/user.html */}
...
<h2>
  {/* ejs 语法 */}
  用户 --- <%= data.name %>
</h2>
```

### 控制器中渲染模板

```js
// app/controller/home.js
"use strict";

const Controller = require("egg").Controller;

class HomeController extends Controller {
  async index() {
    const { ctx } = this;
    // ctx.body = 'hello world!';
    
    let data = {
      name: "张三",
    };
    
    // 渲染 html 模板，await 处理渲染异步
    await ctx.render("user", { data });
  }
}

module.exports = HomeController;
```

{/* 注意：静态资源放在 public 文件夹下，如图片、css、js 等，然后在 html 引入或者引用即可 */}

---

## Service 业务逻辑层

`Service` 用于编写业务逻辑层，保持 `Controller` 的简洁。

### 创建 Service

```js
// app/service/user.js
"use strict";

const Service = require("egg").Service;

class UserService extends Service {
  async getUsers() {
    let users = [
      { name: "张三" },
      { name: "李四" },
      { name: "王五" },
    ];
    return users;
  }
}

module.exports = UserService;
```

### 在 Controller 中使用 Service

```js
// app/controller/user.js
...

async index() {
  const { ctx, service } = this;
  
  // ctx.body = 'hello world!';
  /*
  let data = {
    name: "张三",
  };
  */
  
  // await 同步
  // user: service 下的文件名
  // getUsers(): 文件下的方法
  const data = await service.user.getUsers();
  
  await ctx.render("user", { data });
}
```

---

## 修改 Favicon 图标

```js
// config/config.default.js

// 方法一：以读取网络图片的方式修改
/*
config.siteFile = {
  "/favicon.ico": "https://www.mi.com/favicon.ico",
};
*/

// 方法二：以读取本地文件的方式修改
const fs = require("fs"); // 需要引入 fs 模块，读取图标

config.siteFile = {
  "/favicon.ico": fs.readFileSync("favicon.ico"),
};

// 图标需要放在根目录
```

---

## 核心概念

### Controller（控制器）

- 职责：解析用户的输入、加工处理、返回结果
- 特点：保持简洁，复杂的业务逻辑交给 `Service`

### Service（服务层）

- 职责：编写业务逻辑层
- 特点：可被多个 `Controller` 复用

### Middleware（中间件）

- 职责：编写中间件，处理请求前后的逻辑
- 使用场景：权限校验、日志记录、错误处理等

### Schedule（定时任务）

- 职责：设置定时任务
- 使用场景：定时备份、定时清理、定时统计等

### Extend（扩展）

- `helper.js`：工具函数
- `request.js` / `response.js`：扩展请求和响应对象
- `context.js`：扩展 `Context` 上下文
- `application.js` / `agent.js`：扩展应用和代理

---

## 配置文件

### 多环境配置

`Egg` 支持多环境配置，文件名格式为 `config.{env}.js`：

- `config.default.js`：默认配置
- `config.prod.js`：生产环境
- `config.test.js`：测试环境
- `config.local.js`：本地开发环境
- `config.unittest.js`：单元测试环境

### 配置加载顺序

配置会按照以下顺序加载，后面的会覆盖前面的：

1. `config.default.js`
2. `config.{env}.js`
3. 插件配置
4. 应用配置

---

## 常用插件推荐

| 插件 | 用途 |
|------|------|
| `egg-view-ejs` | `EJS` 模板引擎 |
| `egg-view-nunjucks` | `Nunjucks` 模板引擎 |
| `egg-mysql` | `MySQL` 数据库 |
| `egg-mongoose` | `MongoDB` 数据库 |
| `egg-redis` | `Redis` 缓存 |
| `egg-session` | `Session` 会话 |
| `egg-jwt` | `JWT` 认证 |
| `egg-cors` | 跨域处理 |
| `egg-validate` | 参数校验 |

---

## 部署与运维

### 生产环境启动

```bash
# 启动应用
npm start

# 停止应用
npm stop
```

### 使用 PM2 部署

```bash
# 安装 PM2
npm i pm2 -g

# 启动应用
pm2 start egg.js

# 查看状态
pm2 status

# 查看日志
pm2 logs
```

### 常用命令

```bash
# 运行单元测试
npm test

# 运行代码检查
npm run lint

# 自动修复代码风格
npm run fix
```

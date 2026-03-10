# 广东省数据可视化平台

一个基于 Three.js + SolidJS 构建的 3D 数据可视化大屏项目，实现了广东省经济的三维可视化展示。

## 📋 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [主要功能](#主要功能)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [构建与部署](#构建与部署)
- [开发规范](#开发规范)
- [资源引用](#资源引用)

## 项目简介

这是一个专业的数据可视化大屏项目，通过 Three.js 实现 3D 地图展示，结合 SolidJS 框架和 ECharts 图表库，提供了丰富的经济数据可视化组件。项目支持响应式布局、炫酷的动画效果和现代化的 UI 设计。

### 特点

- 🌍 **3D 地图可视化** - 基于 Three.js 的广东省三维地图展示
- 📊 **丰富的图表组件** - 包含柱状图、饼图、雷达图等多种图表
- ✨ **炫酷动画效果** - GSAP 动画驱动的界面过渡和交互效果
- 🎨 **现代化 UI** - 科技感十足的视觉设计，支持自定义主题
- 📱 **响应式布局** - 使用 autofit.js 实现自适应不同屏幕尺寸
- 🔥 **高性能渲染** - SolidJS 的细粒度更新机制保证流畅体验

## 技术栈

### 核心框架

- **SolidJS 1.9.9** - 高性能前端框架
- **Three.js 0.182.0** - 3D 图形渲染引擎
- **Vite 7.1.4** - 下一代前端构建工具

### 可视化库

- **ECharts 6.0.0** - 强大的数据可视化图表库
- **D3-geo 3.1.1** - 地理数据可视化
- **GSAP 3.14.2** - 专业级动画库

### 样式与工具

- **TailwindCSS 4.1.13** - 原子化 CSS 框架
- **autofit.js 3.2.8** - 屏幕适配方案
- **date-fns 4.1.0** - 日期处理工具
- **mitt 3.0.1** - 事件总线

### 开发工具

- **TypeScript 5.9.2** - 类型安全的 JavaScript 超集
- **Biome 2.3.13** - 代码格式化和检查工具
- **solid-devtools** - SolidJS 开发调试工具

## 主要功能

### 1. 3D 地图模块

- 广东省 3D 地图展示
- 地图动画效果（加载、旋转、高亮等）
- 交互式地图操作
- 地理数据可视化叠加

### 2. 数据图表组件

#### 左侧面板
- **大宗商品销售额** - 展示大宗商品销售趋势
- **年度经济增长点** - 年度经济增长数据分析
- **近年经济情况** - 多年经济对比分析
- **各区经济收益** - 各区域经济收入分布

#### 右侧面板
- **专项资金用途** - 专项资金分配情况
- **人群消费占比** - 不同人群消费比例
- **用电情况** - 用电量统计与趋势
- **各季度增长情况** - 季度增长率分析

#### 其他图表
- **饼图组件** - 环形图、多层饼图
- **雷达图** - 多维度数据展示

### 3. UI 布局组件

- **顶部导航栏** - 标题、天气、时间显示
- **菜单系统** - 顶部导航菜单、底部托盘菜单
- **统计卡片** - 关键指标展示（GDP、人口等）
- **装饰元素** - SVG 线条动画、边框效果

### 4. 动画效果

- Loading 加载动画
- 页面进入动画（Header、菜单、卡片等）
- SVG 线条流动动画
- 扫描光效动画
- 箭头指示动画

## 项目结构

```
three-dimensional/
├── public/                      # 静态资源目录
│   ├── assets/                  # UI 素材
│   │   ├── font/                # 字体文件
│   │   └── images/              # 图片资源
│   ├── draco/                   # Draco 压缩模型解码器
│   ├── geojson/                 # GeoJSON 地理数据
│   └── texture/                 # 纹理贴图
├── src/
│   ├── charts/                  # 图表组件
│   │   ├── bulk-commodity-sales.tsx
│   │   ├── district-economic-income.tsx
│   │   ├── economic-trend.tsx
│   │   ├── electricity-usage.tsx
│   │   ├── pie.tsx
│   │   ├── proportion-population-consumption.tsx
│   │   ├── purpose-special-funds.tsx
│   │   ├── quarterly-growth-situation.tsx
│   │   ├── radar.tsx
│   │   └── yearly-economy-trend.tsx
│   ├── componnets/              # 通用组件
│   │   ├── card.tsx             # 卡片容器
│   │   ├── current-time.tsx     # 当前时间
│   │   ├── svg-line-animation.tsx  # SVG 线条动画
│   │   └── weather.tsx          # 天气组件
│   ├── css/                     # 样式文件
│   │   ├── animation.css        # 动画定义
│   │   ├── font.css             # 字体声明
│   │   └── index.css            # 全局样式
│   ├── helper/                  # 核心辅助模块
│   │   ├── utils/               # 工具函数
│   │   │   ├── event-emitter.ts
│   │   │   ├── request-animation-frame.ts
│   │   │   ├── resource.ts
│   │   │   ├── sizes.ts
│   │   │   ├── sort-by-value.ts
│   │   │   ├── time.ts
│   │   │   ├── transfrom-map-geojson.ts
│   │   │   └── uuid.ts
│   │   ├── world-core/          # 3D 世界核心逻辑
│   │   ├── assets.ts            # 资源管理器
│   │   ├── map.ts               # 3D 地图控制器
│   │   └── world.ts             # 3D 场景主类
│   ├── layouts/                 # 布局组件
│   │   ├── menu/                # 菜单组件
│   │   │   ├── index.tsx
│   │   │   └── menu-item.tsx
│   │   ├── bottom.tsx           # 底部菜单项
│   │   ├── header.tsx           # 顶部导航栏
│   │   ├── statistical-card.tsx
│   │   └── statistical-count.tsx
│   ├── maps/                    # 地图模块
│   │   ├── china.ts
│   │   ├── guang-dong.ts
│   │   ├── info.ts
│   │   └── scatter.ts
│   ├── utils/                   # 工具函数
│   │   ├── cn.ts                # 类名合并
│   │   ├── emitter.ts           # 事件总线
│   │   └── empty-object.ts
│   ├── App.tsx                  # 主应用组件
│   └── index.tsx                # 入口文件
├── build/                       # 构建输出目录
├── scripts/                     # 脚本文件
├── .husky/                      # Git Hooks
├── .vscode/                     # VSCode 配置
├── index.html                   # HTML 模板
├── package.json                 # 项目依赖
├── pnpm-lock.yaml               # 依赖锁定文件
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
└── biome.json                   # Biome 配置
```

## 快速开始

### 环境要求

- Node.js >= 18
-pnpm >= 8

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:3000` 查看应用。

### 代码格式化

```bash
pnpm format    # 检查代码格式
pnpm lint      # 代码检查
pnpm check     # 全面检查
```

## 构建与部署

### 生产构建

```bash
pnpm build
```

构建产物将输出到 `build/` 目录。

### 预览构建结果

```bash
pnpm preview
```

### 部署建议

1. 将 `build/` 目录部署到 Web 服务器
2. 确保服务器支持 gzip/brotli 压缩
3. 配置合适的缓存策略（特别是静态资源）
4. 如需部署到非根路径，需修改 `vite.config.ts` 中的 `base` 配置

## 开发规范

### 代码风格

项目使用 Biome 进行代码检查和格式化，配置遵循 `biome.json`：

- 使用 Tab 缩进
- 双引号字符串
- 启用推荐的 lint 规则
- 自动导入排序

### 命名规范

- **组件文件** - PascalCase (如 `EconomicTrend.tsx`)
- **普通文件** - kebab-case (如 `svg-line-animation.tsx`)
- **变量/函数** - camelCase
- **常量** - UPPER_SNAKE_CASE
- **CSS 类名** - 使用 TailwindCSS 的 `tw:` 前缀

### 目录约定

- `charts/` - 所有图表组件
- `componnets/` - 可复用的 UI 组件
- `layouts/` - 布局相关组件
- `helper/` - 核心业务逻辑和 3D 引擎
- `maps/` - 地图相关模块
- `utils/` - 通用工具函数

## 资源引用

### GeoJSON 数据源

- [GeoJSON.cn](https://geojson.cn/data/atlas/china) - 中国地理信息数据
- [阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) - 行政区划边界数据

### 参考项目

- [react-three-map](https://github.com/Shunrai1/react-three-map) - 参考仓库

### 字体资源

- D-DIN 字体家族
- 阿里妈妈数黑体
- Alibaba PuHuiTi
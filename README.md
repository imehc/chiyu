# 数据可视化大屏

一个基于 Three.js + SolidJS 构建的 3D 数据可视化大屏项目，内置复杂大屏、重庆市、广东省、中国四套大屏。复杂大屏提供中国地图与全球地球双视图，其余三套大屏复用公共布局与地图底层。

## 📋 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [主要功能](#主要功能)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [构建与部署](#构建与部署)
- [开发规范](#开发规范)
- [新增一块大屏](#新增一块大屏)
- [资源引用](#资源引用)

## 项目简介

项目通过 Three.js 实现 3D 地图与地球展示，结合 SolidJS 框架和 ECharts 图表库，展示经济与运输示例数据。支持多屏切换、行政区逐级下钻、图层控制、响应式布局与动画效果。

### 特点

- 🌍 **3D 地图可视化** - 省域 / 全国三维地图与全球地球，支持拉伸、描边、光柱、飞线、散点等图层
- 🖥 **多块大屏** - 复杂、重庆市、广东省、中国四套大屏，按 `S` 显示或隐藏悬浮切换面板
- 🧭 **地图下钻与全球运输** - 复杂大屏支持省市区逐级下钻，以及铁路、海运、空运航线展示
- 📊 **丰富的图表组件** - 包含柱状图、饼图、雷达图等多种图表
- ✨ **炫酷动画效果** - GSAP 动画驱动的加载、入场、镜头推进与界面过渡
- 🎨 **现代化 UI** - 科技感十足的视觉设计，支持自定义主题
- 📱 **响应式布局** - 公共大屏使用 autofit.js，复杂大屏按设计尺寸等比缩放
- 🔥 **高性能渲染** - SolidJS 的细粒度更新机制保证流畅体验

## 技术栈

### 核心框架

- **SolidJS 1.9.19** - 高性能前端框架
- **Three.js 0.187.0** - 3D 图形渲染引擎
- **Vite 8.3.8** - 下一代前端构建工具

### 可视化库

- **ECharts 6.1.0** - 强大的数据可视化图表库
- **D3-geo 3.1.2** - 地理投影与球面计算
- **GSAP 3.15.1** - 专业级动画库

### 样式与工具

- **TailwindCSS 4.3.5** - 原子化 CSS 框架
- **autofit.js 3.2.8** - 屏幕适配方案
- **Tweakpane 4.0.5** - 大屏切换 / 全屏控制面板
- **date-fns 4.4.0** - 日期处理工具
- **mitt 3.0.1** - 事件总线

### 开发工具

- **TypeScript 7.0.2** - 类型安全的 JavaScript 超集
- **Biome 2.6.8** - 代码格式化和检查工具

## 主要功能

### 1. 多屏切换

- 右下角悬浮面板可拖动、可折叠，位置会记录在 localStorage
- 默认展示「复杂大屏」，切换面板默认隐藏；按 `S` 显示或隐藏面板
- 下拉切换「复杂大屏 / 重庆市大屏 / 广东省大屏 / 中国大屏」，各屏按需加载，切换时销毁上一个场景
- 支持通过 `?screen=blue`、`?screen=chongqing`、`?screen=guangdong`、`?screen=china` 直接打开对应大屏，面板切换会同步更新 URL
- 面板内提供进入 / 退出全屏按钮

### 2. 3D 地图模块

#### 重庆市、广东省与中国大屏

- 省市 / 全国 3D 地图拉伸展示，带侧边纹理与轮廓流光
- 加载进度动画 + 镜头推进入场
- 指标光柱、飞线、光圈、散点、监测点标签、区域名称标注
- 支持鼠标交互（区域悬停高亮、点击监测点切换信息卡）

#### 复杂大屏

- **中国视图**：全国 → 省 → 市 → 区县逐级下钻，直辖市、香港和澳门按实际层级直接进入区县；支持返回上级与还原视角
- **全球视图**：8K 地球表面与动态云层、国家边界、地理线、海岸线、扫描效果，以及铁路 / 海运 / 空运航线开关
- **图层控制**：中国视图可切换飞线、标签、点位、热力图和散点；两种视图分别保留当前图层设置
- **视角与交互**：拖动旋转、滚轮缩放，提供放大、缩小、俯视和还原按钮；双击地图画布切换全屏，点击监测点打开详情，按 `Esc` 关闭弹窗
- **过渡动画**：地图下钻、视图切换、图层显示 / 隐藏与面板入场动画

### 3. 数据图表组件

重庆市和广东省大屏复用以下公共图表：

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

#### 中国大屏独立图表

- **左侧** - 省级数据指数排行、区域协同趋势、重点产业分布、区域投资热度
- **右侧** - 区域发展能力、跨区域联动指数、全国节点运行状态、数据流量趋势
- 图表配置位于 `src/screens/china/panels/options.ts`

#### 复杂大屏独立图表

- **中国视图** - 立体环形占比、销售趋势、数据条目、仪表盘、年度经济对比、月度分类与增长趋势
- **全球视图** - 环形占比、每日数据柱图、指标卡、仪表盘、销售趋势与数据条目
- 使用独立的图表主题、SVG 面板边框与流光装饰，随中国 / 全球视图切换图表内容

### 4. UI 布局组件

- **顶部导航栏** - 标题、天气、时间显示
- **菜单系统** - 顶部导航菜单、底部托盘菜单
- **统计卡片** - 关键指标展示（GDP、人口等）
- **装饰元素** - SVG 线条动画、边框效果

### 5. 动画效果

- Loading 加载动画
- 页面进入动画（Header、菜单、卡片等）
- SVG 线条流动动画
- 扫描光效动画
- 箭头指示动画

## 项目结构

```
visualize-dashboard/
├── public/                      # 静态资源目录
│   ├── assets/                  # UI 素材
│   │   ├── font/                # 字体文件
│   │   └── images/              # 图片资源
│   │       └── blue/            # 地球表面、云层、高光贴图与 SOURCE.md
│   ├── draco/                   # Draco 压缩模型解码器
│   ├── geojson/                 # GeoJSON 地理数据
│   │   ├── blue/                # 全国轮廓、省市区下钻数据与 SOURCE.md
│   │   ├── world.json           # 全球国家边界
│   │   ├── 海岸线.json          # 全球海岸线
│   │   └── …                    # 重庆、广东、中国及周边轮廓数据
│   └── texture/                 # 纹理贴图
├── src/
│   ├── charts/                  # 公共图表组件
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
│   ├── layouts/                 # 布局组件
│   │   ├── menu/                # 顶部菜单
│   │   │   ├── index.tsx
│   │   │   └── menu-item.tsx
│   │   ├── bottom.tsx           # 底部菜单项
│   │   ├── header.tsx           # 顶部导航栏
│   │   ├── statistical-card.tsx
│   │   └── statistical-count.tsx
│   ├── screens/                 # 各块大屏
│   │   ├── registry.ts          # 大屏注册表与按需加载入口
│   │   ├── blue/                # 复杂大屏（中国 / 全球双视图）
│   │   ├── chongqing/           # 重庆市大屏
│   │   ├── guangdong/           # 广东省大屏
│   │   └── china/               # 中国大屏
│   │       └── panels/          # 中国大屏图表面板与配置
│   ├── shared/map/              # 重庆、广东、中国大屏共用的地图底层
│   │   ├── assets.ts            # 贴图 / GeoJSON 资源管理
│   │   ├── map-3d.ts            # 地图生命周期、加载进度、UI 入场
│   │   ├── world-core/          # 相机、渲染器与地图组件
│   │   │   ├── components/      # base-map、extrude-map、focus、grid、label-3d、line、particles、plane
│   │   │   ├── extensions/      # CSS3D 对象扩展
│   │   │   └── shader/          # 渐变着色器
│   │   └── utils/               # 投影转换、资源加载、时间、尺寸等工具
│   ├── utils/                   # 通用工具函数
│   │   ├── cn.ts                # 类名合并
│   │   ├── emitter.ts           # 事件总线
│   │   └── empty-object.ts
│   ├── App.tsx                  # URL 选屏、快捷键、切换面板与全屏控制
│   └── index.tsx                # 入口文件
├── index.html                   # HTML 模板
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml          # 依赖构建许可配置
├── tsconfig.json
├── vite.config.ts
├── biome.json
└── README.md
```

重庆市、广东省和中国大屏采用 `config.ts`、`index.tsx`、`world.ts` 与 `data/` 的结构。以重庆市大屏为例：

```
src/screens/chongqing/
├── config.ts                    # 地图资源清单 + 顶部统计卡
├── index.tsx                    # 页面骨架与图表布局
├── world.ts                     # 3D 场景编排（投影参数、光柱、飞线、标注）
└── data/                        # 该屏的地图数据
    ├── regions.ts               # 区县中心点 / 质心 / 指标值
    ├── info.ts                  # 监测点
    ├── scatter.ts               # 散点
    └── china-decoration.ts      # 周边省份标注
```

复杂大屏采用独立的场景、图表与控件实现：

```
src/screens/blue/
├── index.tsx                    # 页面布局、视图 / 图层控制与监测点弹窗
├── world.ts                     # 中国地图、地球场景与行政区下钻
├── header.tsx                   # 顶部导航、标题与时间
├── footer.tsx                   # 底部装饰
├── panels.tsx                   # 中国 / 全球视图图表与指标卡
├── chart-theme.ts               # 图表配色与样式
├── panel-frame.tsx              # 图表面板边框
├── button-frame.tsx             # 控件与页签边框
├── icons.tsx                    # SVG 图标
├── line-flow.tsx                # SVG 流光动画
├── freight.ts                   # 铁路、海运与空运航线
├── map-effects.ts               # 光柱、光圈、散点与监测点效果
├── layer-motion.ts              # 图层显示 / 隐藏动画
├── cloud-transition.ts          # 中国 / 全球视图云层过渡
├── frame-transition.ts          # 帧缓冲过渡工具
├── terrain.ts                   # 地形着色工具
├── style.css                    # 页面布局、加载与过渡样式
├── controls.css                 # 地图控件与视图页签样式
├── panels.css                   # 图表面板与指标卡样式
├── header.css                   # 顶部导航样式
└── footer.css                   # 底部装饰样式
```

复杂大屏的下钻边界按行政区编码存放在 `public/geojson/blue/`，地球贴图存放在 `public/assets/images/blue/`，两个目录的 `SOURCE.md` 分别记录数据层级、资源来源与许可信息。

## 快速开始

### 环境要求

- **Node.js**：20.19+（20.x）或 22.12+，与 Vite 8 的运行要求一致
- **pnpm**：建议使用 11.x

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:3000` 查看应用，默认展示复杂大屏。按 `S` 打开切换面板，或访问 `http://localhost:3000/?screen=chongqing` 直接打开重庆市大屏。

### 代码格式化

```bash
pnpm format         # 检查代码格式
pnpm lint           # 代码检查
pnpm check          # 全面检查
pnpm format --write  # 自动修正代码格式
```

## 构建与部署

### 生产构建

```bash
pnpm build
```

### 预览构建结果

```bash
pnpm preview
```

构建产物输出到 `dist/` 目录。

### 部署建议

1. 将 `dist/` 目录部署到 Web 服务器
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

- **文件** - 沿用目录现有命名，组件与工具通常使用 kebab-case（如 `svg-line-animation.tsx`）
- **变量/函数** - camelCase
- **常量** - UPPER_SNAKE_CASE
- **CSS 类名** - 公共布局使用 TailwindCSS 的 `tw:` 前缀；复杂大屏独立样式使用 `blue-` 前缀

### 目录约定

- `charts/` - 公共图表组件
- `componnets/` - 可复用的 UI 组件
- `layouts/` - 布局相关组件
- `screens/` - 各块大屏（页面 + 场景 + 数据）
- `screens/blue/` - 复杂大屏的独立场景、图表、控件与样式
- `shared/map/` - 重庆市、广东省和中国大屏共用的 3D 地图底层
- `public/geojson/blue/` - 复杂大屏的行政区下钻边界
- `public/assets/images/blue/` - 复杂大屏的地球贴图
- `utils/` - 通用工具函数

## 新增一块大屏

新增复用公共地图底层的省市大屏时，以「重庆市大屏」为例：

1. **准备地理数据**：从 [DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) 取 `<行政区 adcode>_full.json`（下级行政区）与 `<行政区 adcode>.json`（区域轮廓），放到 `public/geojson/`。
2. **复制大屏目录**：拷贝 `src/screens/guangdong` 为 `src/screens/<新屏>`，改掉 `index.tsx` 的标题与 autofit 元素 id、`config.ts` 的资源路径与统计卡数值。
3. **调整地图参数**：在 `world.ts` 里改 `_geoProjectionCenter`、`_geoProjectionScale`、`_flyLineCenter` 与主标注 `center`，并替换 `data/` 下的区县、监测点、散点、周边省份标注。
4. **注册大屏**：在 `src/screens/registry.ts` 的 `screenRegistry` 中加一项 `label / short / component`，按现有条目使用 `lazy(() => import("./<新屏>"))` 作为组件入口，下拉面板会自动出现新选项。

需要独立场景、图表或图层交互的大屏，可参考 `src/screens/blue/` 的目录组织，并在同一注册表中添加入口。

> 提示：投影 `scale` 建议让地图横向跨度落在 14~16 之间，与广东大屏的视觉体量一致；指标柱若直接取前 N 名导致标签叠压，可像重庆屏那样在 `world.ts` 里手写 `getBarRegions()` 挑选方位分散的区域，飞线复用同一份列表。

## 资源引用

### GeoJSON 数据源

- [阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) - 行政区划边界数据（重庆、广东、中国及复杂大屏的省市区下钻边界）
- [复杂大屏 GeoJSON 来源说明](public/geojson/blue/SOURCE.md) - 全国轮廓、33 组省级下钻集合、329 组市级下钻集合；台湾使用单区域轮廓
- [GeoJSON.cn](https://geojson.cn/data/atlas/china) - 中国地理信息数据

### 地球贴图

- [Solar System Scope](https://www.solarsystemscope.com/textures/) - 8K 地球表面与云层贴图，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用
- [Three.js 示例贴图](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets) - 地球高光贴图与早期参考资源
- [地球贴图来源说明](public/assets/images/blue/SOURCE.md) - 本地文件与上游地址对照、作者及许可信息

### 参考项目

- [react-three-map](https://github.com/Shunrai1/react-three-map) - 参考仓库

### 字体资源

- D-DIN 字体家族
- 阿里妈妈数黑体
- Alibaba PuHuiTi

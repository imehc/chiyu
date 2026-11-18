# 项目规范

## 内容分类

站点按「知识库 + 博客」组织。知识库按开发领域导航，博客按时间展示。

| 分类 | 内容 | 领域入口 |
| --- | --- | --- |
| 前端开发 | JavaScript、框架、构建、Three.js、Canvas、Cesium | `docs/knowledge/frontend.mdx` |
| 后端开发 | Node.js、Java、数据库、服务端实践 | `docs/knowledge/backend.mdx` |
| 应用开发 | 移动端、桌面应用、Swift、Xcode | `docs/knowledge/apps.mdx` |
| 工程与工具 | 环境配置、部署、命令、开发工具 | `docs/knowledge/engineering.mdx` |

- 学习笔记、排错记录、开发过程放在 `blog/`；保留已有文件名、日期和地址。
- 连续教程和可运行示例放在 `docs/`。已有 Web 示例放在 `docs/web/`，按 Three.js、Canvas、Cesium 和基础、进阶、综合案例分类。
- 新增独立知识库教程放在 `docs/knowledge/<领域>/<主题>/`，领域使用 `frontend`、`backend`、`apps`、`engineering`。
- 博客归属在 `src/data/knowledge.ts` 中维护，使用文章原地址。跨领域内容选一个主要分类，需要时在其他分类添加链接，正文只保留一份。
- 新增教程目录要接入 `sidebars.ts`；新增平台分类应有实际内容。

## 示例目录

- 源码放在 `src/exmaples/web/<技术>/<层级>/<编号>/`，例如 `src/exmaples/web/three/basic/11/`。Canvas 没有层级目录。
- 沿用现有编号目录，新增示例在所属分类内递增编号；文档文件名按现有写法包含编号和主题。
- 公共容器、操作面板、FPS 组件放在 `src/exmaples/web/componets/`；只供单个示例使用的组件放在该示例内。
- MDX 引用对应源码。文档通过 `sidebar_position` 排序；目录迁移时检查导入、源码展示和静态资源引用，保留公开 URL。
- 参数面板放在画布下方，默认收起。全屏时画布铺满屏幕，操作面板、退出全屏和源码入口以透明背景的图标悬浮展示。FPS 限定在画布内。
- 可运行示例下方接入「查看源码」按钮，有操作面板时放在同一行。弹窗中的文件标签固定，只滚动代码区域；通过 `ExampleSource` 和 `?example-source` 自动读取入口及引用文件，已使用 StackBlitz 编辑器的示例不重复接入。
- 源码弹窗提供对应入口文件的 GitHub 链接，仓库地址和分支在 `src/data/repository.ts` 中维护。
- 图形与可视化分类首页展示文字卡片画廊，通过文档元数据自动收录示例，并按技术、层级和关键词筛选，保留已有示例地址。
- 页面离开时清理动画、事件、GUI、视频和渲染资源；异步加载完成后先检查页面是否已卸载。

## 资源

- 网页资源放在 `static/`，新增资源按所属技术和示例归档；已有 `static/cesium/`、`static/v212/` 等路径沿用现有结构。
- Blender 原文件、大图等源文件当前也保留在 `static/`。新增源文件时在对应示例文档中写明源文件与运行时资源的位置。
- 不删除暂未使用的资源。去重前用文件哈希确认内容相同，更新所有引用；不能确认就保留。
- 压缩或重新导出资源时保留原文件，并检查尺寸、透明通道和示例效果。

## 文案与检查

- 按现有笔记风格直接写主题、版本、命令、代码和操作。避免「本篇专注」「本篇负责」等文章自我介绍。
- 旧 API 标明适用版本；明显错误可以修正，重复章节用链接关联。保留已有文章地址和外部可用锚点。
- 博客使用 `title`、`date`、`tags`、`draft`、`description`，摘要简短说明内容。
- 修改源码或配置后运行 `pnpm typecheck`、`pnpm lint --error-on-warnings`、`pnpm build`，按改动范围检查页面与交互。
- 目录或资源调整要检查地址、导入和资源链接；布局调整要检查电脑和手机。
- `CLASSIFICATION_PROGRESS.md` 仅作本地进度记录，已加入 `.gitignore`，不要暂存、提交，也不要在正式文档中链接它。

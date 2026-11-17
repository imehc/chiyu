# 学习与记录项目

这是一个用于学习和记录技术内容的项目，按以下开发领域组织知识库：

- **前端开发**：JavaScript、框架与生态、图形与可视化
- **后端开发**：Node.js、Java、数据库、服务实践
- **应用开发**：移动端与桌面应用
- **工程与工具**：开发环境、部署流程、命令速查、开发工具

本项目使用 [Docusaurus](https://docusaurus.io/) 构建，用于组织和展示学习笔记与示例代码。

## 内容组织

- 知识库入口：`docs/intro.md`，四个领域页面位于 `docs/knowledge/`。
- 博客继续按时间展示，领域目录链接原文章，不复制正文。
- 领域及文章归属维护在 `src/data/knowledge.ts`，总览页面与侧栏共同使用。
- Web 示例保留在 `docs/web/`，现有文章和示例地址不变。
- 示例源码位于 `src/exmaples/web/`，按技术、层级和编号组织；公共容器和面板位于 `src/exmaples/web/componets/`。
- 网页资源、Blender 原文件和原始大图目前均放在 `static/`，随站点一起发布。
- 新增内容的分类、目录和检查要求见 [AGENTS.md](./AGENTS.md)。

## 部署

- GitHub Pages：`.github/workflows/deploy-pages.yml`（自动）
- 自有服务器（华为云 ECS）：`.github/workflows/deploy-server.yml`，配置与服务器准备见 [从零部署静态网站到华为云 ECS](./blog/从零部署静态网站到华为云ECS.md)

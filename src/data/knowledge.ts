export const knowledgeDomains = [
	{
		id: "frontend",
		title: "前端开发",
		description:
			"JavaScript、React、Vue，以及 Three.js、Canvas 和 Cesium 交互示例。",
		groups: [
			{
				title: "JavaScript 基础",
				description: "查阅语言基础、浏览器 API 和常见编程技巧。",
				articles: [
					{ title: "JavaScript 指南", href: "/blog/JavaScript指南" },
					{ title: "类型判断与核心 API", href: "/blog/js类型判断" },
				],
			},
			{
				title: "框架与生态",
				description:
					"围绕 React 和 Vue，整理组件、状态管理和应用框架的学习笔记。",
				articles: [
					{ title: "React 高级特性与生态", href: "/blog/react" },
					{ title: "React：Redux 与 Router", href: "/blog/react笔记" },
					{ title: "Vue 3 核心知识", href: "/blog/Vue3相关" },
					{ title: "Vuex 核心知识", href: "/blog/Vuex" },
					{ title: "Vue 随手笔记", href: "/blog/Vue随手笔记" },
					{ title: "Umi 快速上手", href: "/blog/umi" },
				],
			},
			{
				title: "构建与实践",
				description: "从构建配置到浏览器里的实际问题。",
				articles: [
					{ title: "Webpack 配置与优化", href: "/blog/Webpack" },
					{ title: "前端下载文件踩坑", href: "/blog/下载文件踩坑" },
				],
			},
		],
	},
	{
		id: "backend",
		title: "后端开发",
		description: "Node.js 与 Java 框架、数据库操作，以及服务端实践。",
		groups: [
			{
				title: "Node.js",
				description: "学习服务端框架的目录结构、路由和业务组织方式。",
				articles: [
					{
						title: "NestJS 基础与目录结构",
						href: "/blog/nestjs基础介绍与文件说明",
					},
					{ title: "Egg.js 开发指南", href: "/blog/egg" },
				],
			},
			{
				title: "Java",
				description: "Spring 核心概念与 Java 工具使用。",
				articles: [
					{ title: "Spring 框架核心教程", href: "/blog/Spring" },
					{ title: "Java 文档生成工具", href: "/blog/Java" },
				],
			},
			{
				title: "数据库",
				description: "MySQL 的连接、查询、用户管理、备份与事务操作。",
				articles: [
					{ title: "MySQL 常用操作与 DOS 命令", href: "/blog/Dos和mysql" },
				],
			},
			{
				title: "服务实践",
				description: "结合完整示例，理解服务端与浏览器之间的数据传输。",
				articles: [
					{ title: "WebRTC 视频流服务端", href: "/blog/WebRTC服务端DEMO" },
				],
			},
		],
	},
	{
		id: "apps",
		title: "应用开发",
		description: "移动端和桌面应用的开发记录，先从 Swift 与 Xcode 排错开始。",
		groups: [
			{
				title: "Swift 与 Xcode",
				description: "排查依赖解析、网络代理和构建过程中的常见问题。",
				articles: [
					{ title: "Swift / Xcode 排错指南", href: "/blog/Swift排错指南" },
				],
			},
		],
	},
	{
		id: "engineering",
		title: "工程与工具",
		description: "开发环境、部署流程、命令速查和日常开发工具。",
		groups: [
			{
				title: "部署与运行",
				description: "从本地调试到容器运行，再到静态网站自动部署。",
				articles: [
					{ title: "Docker 基础命令", href: "/blog/docker" },
					{
						title: "静态网站部署到华为云 ECS",
						href: "/blog/从零部署静态网站到华为云ECS",
					},
					{ title: "本地文件服务", href: "/blog/本地文件服务" },
				],
			},
			{
				title: "命令与开发环境",
				description: "查找 Git、包管理器、Linux 和 Windows 的常用操作。",
				articles: [
					{
						title: "Git、包管理器与部署命令",
						href: "/blog/常用命令与部署指南",
					},
					{ title: "Linux 命令速查", href: "/blog/常用Linux命令" },
					{ title: "Windows DOS 命令速查", href: "/blog/Dos命令" },
				],
			},
			{
				title: "开发工具",
				description: "收集实用工具和 AI 编程工具的使用记录。",
				articles: [
					{ title: "开发者实用工具", href: "/blog/好用的工具" },
					{
						title: "AI 编程工具的本地记录清理",
						href: "/blog/清理AI编程工具本地对话记录",
					},
				],
			},
		],
	},
] as const;

export type KnowledgeDomainId = (typeof knowledgeDomains)[number]["id"];

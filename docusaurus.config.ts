import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";
import { SITE_BASE_URL } from "./src/config/site";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
	title: "Chiyu",
	tagline: "开发知识库与实践记录",
	favicon: "favicon.svg",

	// Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
	future: {
		v4: true, // Improve compatibility with the upcoming Docusaurus v4
		faster: true,
	},

	// Set the production url of your site here
	// 可通过环境变量覆盖，便于部署到自有服务器；未设置时沿用 GitHub Pages 地址
	url: (process.env.SITE_URL || "https://imehc.github.io").replace(/\/+$/, ""),
	// Set the /<baseUrl>/ pathname under which your site is served
	// 默认根目录；GitHub Pages 项目站点构建时传 SITE_BASE_URL=/Chiyu/
	baseUrl: SITE_BASE_URL,

	onBrokenLinks: "throw",

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: "zh-Hans",
		locales: ["zh-Hans"],
	},

	plugins: [
		"./src/plugins/example-gallery.ts",
		"./src/plugins/tailwind-config.ts",
		"./src/plugins/rspack-config.ts",
		"./src/plugins/cesium-config.ts",
	],

	markdown: {
		mermaid: true,
	},

	themes: [
		"@docusaurus/theme-mermaid",
		[
			"@easyops-cn/docusaurus-search-local",
			{
				hashed: true,
				language: ["zh", "en"],
				indexBlog: true,
				indexPages: false,
				indexDocs: true,
				docsRouteBasePath: "/",
				blogRouteBasePath: "/blog",
				explicitSearchResultPath: true,
				highlightSearchTermsOnTargetPage: true,
				searchResultLimits: 8,
				searchResultContextMaxLength: 50,
			},
		],
	],

	presets: [
		[
			"classic",
			{
				docs: {
					id: "default",
					path: "docs",
					routeBasePath: "/",
					sidebarPath: "./sidebars.ts",
					showLastUpdateTime: true,
					showLastUpdateAuthor: true,
					// editUrl: 'https://github.com/imehc/three-dimensional/edit/main/',
				},
				blog: {
					path: "blog",
					routeBasePath: "blog",
					blogTitle: "博客",
					blogDescription:
						"按时间阅读前端、后端、应用开发与工程工具的实践、踩坑和更新。",
					showReadingTime: true,
					showLastUpdateTime: false,
					showLastUpdateAuthor: false,
					postsPerPage: 10, // 文章列表分页
					blogSidebarTitle: "最近文章",
					blogSidebarCount: 15,
					onInlineTags: "ignore", // 禁用未定义标签警告
					onUntruncatedBlogPosts: "ignore", // 禁用无截断文章警告
					// editUrl: 'https://github.com/imehc/three-dimensional/edit/main/',
				},
				theme: {
					customCss: "./src/css/custom.css",
				},
			} satisfies Preset.Options,
		],
	],

	themeConfig: {
		// Replace with your project's social card
		image: "favicon.svg",
		colorMode: {
			defaultMode: "light",
			respectPrefersColorScheme: true,
			disableSwitch: false,
		},
		navbar: {
			title: "Chiyu",
			hideOnScroll: true,
			logo: {
				alt: "Chiyu Logo",
				src: "favicon.svg",
			},
			items: [
				{
					type: "docSidebar",
					sidebarId: "knowledgeSidebar",
					label: "知识库",
					position: "left",
				},
				{
					to: "/blog",
					label: "博客",
					position: "left",
				},
			],
		},
		// footer: {
		//   style: 'light',
		//   links: [],
		//   copyright: `Copyright © ${new Date().getFullYear()}. Built with Docusaurus.`,
		// },
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula,
		},
		liveCodeBlock: {
			playgroundPosition: "bottom",
		},
	} satisfies Preset.ThemeConfig,
};

export default config;

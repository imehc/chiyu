import fs from "node:fs/promises";
import path from "node:path";
import type { LoadedContent } from "@docusaurus/plugin-content-docs";
import type { LoadContext, Plugin } from "@docusaurus/types";
import type { GalleryExample } from "../data/examples";

const technologies = {
	three: "Three.js",
	canvas: "Canvas",
	cesium: "Cesium",
} as const;
const levels = {
	basic: "基础",
	advanced: "进阶",
	showcases: "综合案例",
	"spatial-analysis": "空间分析",
} as const;

function summary(source: string) {
	const body = source
		.replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
		.replace(/```[\s\S]*?```/g, "");
	for (const raw of body.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || /^(?:import\b|export\b|#|<|\{|\}|\/\/)/.test(line)) continue;
		const text = line
			.replace(/^[-*]\s+/, "")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/[*`]/g, "");
		if (text) return text.length > 160 ? `${text.slice(0, 160)}…` : text;
	}
	return "";
}

export default function exampleGalleryPlugin(context: LoadContext): Plugin {
	return {
		name: "example-gallery",
		async allContentLoaded({ allContent, actions }) {
			const content = allContent["docusaurus-plugin-content-docs"]?.default as
				| LoadedContent
				| undefined;
			const version =
				content?.loadedVersions.find(
					(item) => item.versionName === "current",
				) ?? content?.loadedVersions[0];
			const docs =
				version?.docs.filter(
					(doc) => doc.sourceDirName.startsWith("web/") && !doc.unlisted,
				) ?? [];
			const entries = await Promise.all(
				docs.map(async (doc) => {
					const [, technologyKey, levelKey] = doc.sourceDirName.split("/");
					const technology =
						technologies[technologyKey as keyof typeof technologies];
					if (!technology)
						throw new Error(`Unknown gallery technology: ${doc.sourceDirName}`);
					const level = levels[levelKey as keyof typeof levels] ?? "基础";
					const source = await fs.readFile(
						path.join(context.siteDir, doc.source.replace(/^@site\//, "")),
						"utf8",
					);
					const example: GalleryExample = {
						id: doc.id,
						title: doc.title,
						href: doc.permalink,
						description:
							doc.frontMatter.description ??
							(summary(source) || `${technology} ${level}交互示例。`),
						technology,
						level,
					};
					return { example, position: doc.sidebarPosition ?? 0 };
				}),
			);
			const technologyOrder = ["Three.js", "Canvas", "Cesium"];
			const levelOrder = ["基础", "进阶", "综合案例", "空间分析"];
			entries.sort(
				(a, b) =>
					technologyOrder.indexOf(a.example.technology) -
						technologyOrder.indexOf(b.example.technology) ||
					levelOrder.indexOf(a.example.level) -
						levelOrder.indexOf(b.example.level) ||
					a.position - b.position ||
					a.example.title.localeCompare(b.example.title, "zh-Hans"),
			);
			actions.setGlobalData({
				examples: entries.map(({ example }) => example),
			});
		},
	};
}

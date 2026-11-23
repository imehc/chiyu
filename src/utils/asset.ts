// 由 src/plugins/rspack-config.ts 在构建时注入，值与 baseUrl 一致
declare const __SITE_BASE_URL__: string;

const BASE_PREFIX = (
	typeof __SITE_BASE_URL__ === "string" ? __SITE_BASE_URL__ : "/"
).replace(/\/+$/, "");

/**
 * static 下的根路径资源转成当前部署路径。
 * asset("/models/a.glb") -> "/chiyu/models/a.glb"（GitHub Pages）或 "/models/a.glb"（根目录部署）
 */
export function asset(path: string): string {
	if (!path.startsWith("/") || path.startsWith("//")) return path;
	return `${BASE_PREFIX}${path}`;
}

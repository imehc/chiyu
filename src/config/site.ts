/** 规范化部署根路径：始终以 / 开头和结尾，根目录为 / */
export function normalizeBaseUrl(value: string): string {
	const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
	return trimmed ? `/${trimmed}/` : "/";
}

/** 部署根路径，默认根目录；GitHub Pages 构建时传 SITE_BASE_URL=/chiyu/ */
export const SITE_BASE_URL = normalizeBaseUrl(process.env.SITE_BASE_URL || "/");

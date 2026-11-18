import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const siteDir = path.resolve(path.dirname(scriptFile), "..");
const configFile = path.join(siteDir, "scripts/dashboard-preview.json");
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
const output = path.join(siteDir, "static/previews/dashboard-screen");
const manifestFile = path.join(output, "preview.json");
const integrationHash = createHash("sha256")
	.update(fs.readFileSync(scriptFile))
	.digest("hex");
const reuseCache = process.argv.includes("--if-needed");

function run(command, args, cwd = siteDir) {
	execFileSync(command, args, {
		cwd,
		stdio: "inherit",
		env: { ...process.env, CI: "true" },
	});
}

function git(args) {
	return execFileSync("git", args, { cwd: siteDir, encoding: "utf8" }).trim();
}

function latestCommit() {
	try {
		run("git", ["fetch", "--no-tags", "origin", config.branch]);
		return git(["rev-parse", "FETCH_HEAD"]);
	} catch (error) {
		if (!reuseCache || !fs.existsSync(manifestFile)) throw error;
		const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
		if (!cached(manifest.commit)) throw error;
		console.warn("无法获取大屏最新版本，本次使用已生成的预览缓存。");
		return manifest.commit;
	}
}

function cached(commit) {
	if (
		!fs.existsSync(manifestFile) ||
		!fs.existsSync(path.join(output, "index.html")) ||
		!fs.existsSync(path.join(output, "project.json"))
	)
		return false;
	const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
	return (
		manifest.commit === commit && manifest.integrationHash === integrationHash
	);
}

function rewriteRuntimeUrls(source) {
	// Vite resolves asset imports and CSS URLs. Runtime strings need document-relative paths.
	return source
		.split("\n")
		.map((line) => {
			if (/^\s*import\b/.test(line)) return line;
			return line.replace(
				/(["'])\/(assets|geojson|texture|draco)\/([^"'\r\n]*)\1/g,
				(_, quote, directory, filename) =>
					`${quote}./${directory}/${filename}${quote}`,
			);
		})
		.join("\n");
}

function adaptSource(directory) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) adaptSource(filename);
		else if (/\.[jt]sx?$/.test(filename)) {
			const original = fs.readFileSync(filename, "utf8");
			const adapted = rewriteRuntimeUrls(original);
			if (adapted !== original) fs.writeFileSync(filename, adapted);
		}
	}
}

function filesUnder(directory, prefix = "") {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		return entry.isDirectory()
			? filesUnder(path.join(directory, entry.name), relative)
			: [relative];
	});
}

function stackBlitzProject(project, commit) {
	const filenames = [
		...filesUnder(path.join(project, "src")).map((name) => `src/${name}`),
		"index.html",
		"package.json",
		"pnpm-lock.yaml",
		"tsconfig.json",
		"vite.config.ts",
		"biome.json",
		"README.md",
	];
	const files = Object.fromEntries(
		filenames.map((name) => [
			name,
			fs.readFileSync(path.join(project, name), "utf8"),
		]),
	);
	const manifest = {
		baseUrl: `${config.repository.replace("https://github.com/", "https://raw.githubusercontent.com/")}/${commit}/public/`,
		files: filesUnder(path.join(project, "public")),
	};
	files["preview-assets.json"] = JSON.stringify(manifest, null, 2);
	files["prepare-assets.mjs"] = [
		'import fs from "node:fs";',
		'import path from "node:path";',
		'const manifest = JSON.parse(fs.readFileSync("preview-assets.json", "utf8"));',
		"let next = 0;",
		"await Promise.all(Array.from({ length: 6 }, async () => {",
		"  while (next < manifest.files.length) {",
		"    const filename = manifest.files[next++];",
		'    const target = path.join("public", filename);',
		"    if (fs.existsSync(target)) continue;",
		'    const url = manifest.baseUrl + filename.split("/").map(encodeURIComponent).join("/");',
		"    const response = await fetch(url);",
		'    if (!response.ok) throw new Error("Failed to download " + filename + ": " + response.status);',
		"    fs.mkdirSync(path.dirname(target), { recursive: true });",
		"    fs.writeFileSync(target, new Uint8Array(await response.arrayBuffer()));",
		"  }",
		"}));",
		'console.log("Dashboard assets ready.");',
		"",
	].join("\n");
	const packageJson = JSON.parse(files["package.json"]);
	packageJson.scripts.dev = "node prepare-assets.mjs && vite --host 0.0.0.0";
	files["package.json"] = JSON.stringify(packageJson, null, 2);
	files[".stackblitzrc"] = JSON.stringify(
		{ startCommand: "npm run dev" },
		null,
		2,
	);
	return { files };
}

function main() {
	const commit = latestCommit();
	if (!/^[a-f0-9]{40}$/.test(commit))
		throw new Error("Dashboard preview requires a full commit SHA.");
	if (reuseCache && cached(commit)) return;
	try {
		execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
			cwd: siteDir,
			stdio: "ignore",
		});
	} catch {
		run("git", ["fetch", "--no-tags", "origin", commit]);
	}

	const cacheDir = path.join(siteDir, ".dashboard-preview", commit);
	const project = path.join(cacheDir, "project");
	fs.mkdirSync(project, { recursive: true });
	const archive = path.join(cacheDir, "source.tar");
	run("git", ["archive", "--format=tar", `--output=${archive}`, commit]);
	run("tar", ["-xf", archive, "-C", project]);
	const sourceProject = stackBlitzProject(project, commit);
	adaptSource(path.join(project, "src"));
	fs.writeFileSync(
		path.join(project, "pnpm-workspace.yaml"),
		'packages:\n  - "."\nallowBuilds:\n  "@tailwindcss/oxide": true\n  esbuild: true\nonlyBuiltDependencies:\n  - "@tailwindcss/oxide"\n  - "esbuild"\n',
	);
	fs.writeFileSync(
		path.join(project, "vite.preview.config.ts"),
		[
			'import { mergeConfig } from "vite";',
			'import original from "./vite.config";',
			'export default mergeConfig(original, { base: "./", build: { outDir: "preview-dist" } });',
			"",
		].join("\n"),
	);
	console.log(`Building ${config.branch} preview from ${commit.slice(0, 8)}…`);
	run("pnpm", ["install", "--frozen-lockfile"], project);
	run(
		"pnpm",
		["exec", "vite", "build", "--config", "vite.preview.config.ts"],
		project,
	);
	const dist = path.join(project, "preview-dist");
	if (!fs.existsSync(path.join(dist, "index.html")))
		throw new Error("Dashboard build did not produce index.html.");

	// Replace only this script's generated preview after the independent build succeeds.
	if (fs.existsSync(output) && !fs.existsSync(manifestFile))
		throw new Error("Refusing to replace an unrecognized preview directory.");
	fs.rmSync(output, { recursive: true, force: true });
	fs.cpSync(dist, output, { recursive: true });
	fs.writeFileSync(
		path.join(output, "project.json"),
		JSON.stringify(sourceProject),
	);
	fs.writeFileSync(
		manifestFile,
		`${JSON.stringify({ branch: config.branch, commit, integrationHash }, null, 2)}\n`,
	);
	console.log("Dashboard preview ready: /previews/dashboard-screen/index.html");
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}

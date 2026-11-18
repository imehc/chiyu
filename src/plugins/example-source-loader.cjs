const fs = require("node:fs");
const path = require("node:path");

// Tokenize strings separately so comments and example strings cannot add imports.
function moduleSpecifiers(source) {
	const tokens =
		source.match(
			/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g,
		) ?? [];
	const code = tokens.filter(
		(token) => !token.startsWith("//") && !token.startsWith("/*"),
	);
	const specifiers = [];
	const isString = (token) => token?.startsWith('"') || token?.startsWith("'");
	for (let i = 0; i < code.length; i++) {
		const token = code[i];
		if (token === "require" || (token === "import" && code[i + 1] === "(")) {
			if (code[i + 1] === "(" && isString(code[i + 2]))
				specifiers.push(code[i + 2].slice(1, -1));
			continue;
		}
		if (token === "import" && isString(code[i + 1])) {
			specifiers.push(code[i + 1].slice(1, -1));
			continue;
		}
		if (token !== "import" && token !== "export") continue;
		if (token === "import" && code[i + 1] === ".") continue;
		if (token === "export" && !["*", "{", "type"].includes(code[i + 1]))
			continue;
		for (let j = i + 1; j < code.length; j++) {
			if ([";", "=", "import", "export"].includes(code[j])) break;
			if (code[j] === "from" && isString(code[j + 1])) {
				specifiers.push(code[j + 1].slice(1, -1));
				break;
			}
		}
	}
	return specifiers;
}

function resolveSource(specifier, importer, siteDir) {
	const request = specifier.split("?")[0];
	const target = request.startsWith("@site/")
		? path.resolve(siteDir, request.slice(6))
		: request.startsWith(".")
			? path.resolve(path.dirname(importer), request)
			: null;
	if (!target?.startsWith(`${path.join(siteDir, "src")}${path.sep}`))
		return null;
	const extensions = [
		"",
		".tsx",
		".ts",
		".jsx",
		".js",
		".mjs",
		".cjs",
		".json",
		".css",
		".d.ts",
	];
	for (const candidate of [
		...extensions.map((extension) => target + extension),
		...extensions
			.slice(1)
			.map((extension) => path.join(target, `index${extension}`)),
	]) {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
			return candidate;
	}
	throw new Error(
		`Cannot find example source ${specifier} imported by ${importer}`,
	);
}

function collectSources(entry, siteDir, addDependency = () => {}) {
	const sources = new Map();
	let usesStackBlitz = false;
	function visit(filename) {
		if (sources.has(filename)) return;
		addDependency(filename);
		const code = fs.readFileSync(filename, "utf8");
		sources.set(filename, code);
		if (path.basename(filename) === "StackBlitzPlayground.tsx")
			usesStackBlitz = true;
		if (!/\.(?:[cm]?[jt]sx?|css)$/.test(filename)) return;
		for (const specifier of moduleSpecifiers(code)) {
			if (specifier === "@stackblitz/sdk") usesStackBlitz = true;
			const dependency = resolveSource(specifier, filename, siteDir);
			if (dependency) visit(dependency);
		}
	}
	visit(entry);
	const directory = path.dirname(entry);
	const relativeName = (filename) =>
		path.relative(directory, filename).split(path.sep).join("/");
	const entries = [...sources.entries()].sort(([a], [b]) => {
		if (a === entry) return -1;
		if (b === entry) return 1;
		const sharedA = !a.startsWith(`${directory}${path.sep}`);
		const sharedB = !b.startsWith(`${directory}${path.sep}`);
		return (
			Number(sharedA) - Number(sharedB) ||
			relativeName(a).localeCompare(relativeName(b))
		);
	});
	return {
		files: Object.fromEntries(
			entries.map(([filename, code]) => [relativeName(filename), code]),
		),
		usesStackBlitz,
	};
}

module.exports = function exampleSourceLoader() {
	const { url, branch } = this.getOptions();
	const { files, usesStackBlitz } = collectSources(
		this.resourcePath,
		this.rootContext,
		(filename) => this.addDependency(filename),
	);
	const relativePath = path
		.relative(this.rootContext, this.resourcePath)
		.split(path.sep)
		.map(encodeURIComponent)
		.join("/");
	const bundle = {
		files: usesStackBlitz ? {} : files,
		githubUrl: `${url}/blob/${encodeURIComponent(branch)}/${relativePath}`,
	};
	return `export default ${JSON.stringify(bundle)};`;
};
module.exports.collectSources = collectSources;
module.exports.moduleSpecifiers = moduleSpecifiers;

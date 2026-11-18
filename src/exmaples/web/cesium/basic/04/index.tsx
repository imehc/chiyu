import StackBlitzPlayground from "@site/src/components/StackBlitzPlayground";
import Container from "../../../componets/Container";
import indexHtmlRaw from "./examples/index.html?raw";
import packageJson from "./examples/package.json?raw";
import AppRaw from "./examples/src/App.tsx.raw?raw";
import cssRaw from "./examples/src/index.css.raw?raw";
import mainRaw from "./examples/src/main.tsx.raw?raw";
import tsConfigAppRaw from "./examples/tsconfig.app.json?raw";
import tsConfigRaw from "./examples/tsconfig.json?raw";
import tsConfigNodeRaw from "./examples/tsconfig.node.json?raw";
import viteConfigRaw from "./examples/vite.config.ts.raw?raw";

export default function App() {
	const files = {
		"index.html": indexHtmlRaw,
		"package.json": packageJson,
		"vite.config.ts": viteConfigRaw,
		"tsconfig.app.json": tsConfigAppRaw,
		"tsconfig.node.json": tsConfigNodeRaw,
		"tsconfig.json": tsConfigRaw,
		"src/index.css": cssRaw,
		"src/App.tsx": AppRaw,
		"src/main.tsx": mainRaw,
	};

	return (
		<Container hiddenBorder autoHeight fullWidth allowFullscreen={false}>
			<StackBlitzPlayground
				files={files}
				title="Cesium WKT 转 GeoJSON"
				description="在 StackBlitz 中在线运行和修改完整示例"
				openFile="src/App.tsx"
			/>
		</Container>
	);
}

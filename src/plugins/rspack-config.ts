import path from "node:path";
import type { Plugin } from "@docusaurus/types";

export default function rspackPlugin(context: { siteDir: string }): Plugin {
	return {
		name: "rspack-plugin",
		configureWebpack(_config, _isServer, { currentBundler }) {
			return {
				plugins: [new currentBundler.instance.DefinePlugin({})],
				module: {
					rules: [
						{
							resourceQuery: /example-source/,
							type: "javascript/auto",
							use: [
								path.join(
									context.siteDir,
									"src/plugins/example-source-loader.cjs",
								),
							],
						},
						{
							resourceQuery: /raw/,
							type: "asset/source",
						},
					],
				},
			};
		},
	};
}

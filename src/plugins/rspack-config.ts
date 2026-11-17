import type { Plugin } from "@docusaurus/types";

export default function rspackPlugin(): Plugin {
	return {
		name: "rspack-plugin",
		configureWebpack(_config, _isServer, { currentBundler }) {
			return {
				plugins: [new currentBundler.instance.DefinePlugin({})],
				module: {
					rules: [
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

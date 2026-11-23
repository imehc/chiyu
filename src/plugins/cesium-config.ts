import path from "node:path";
import CopyWebpackPlugin from "copy-webpack-plugin";
import { config } from "dotenv";
import { SITE_BASE_URL } from "../config/site";

// 加载 .env 文件
config();

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesiumStatic";

export default function cesiumPlugin(): Plugin {
	return {
		name: "cesium-plugin",
		configureWebpack(_config, isServer, { currentBundler }) {
			// Only apply Cesium configuration for client bundle
			if (isServer) {
				return {};
			}

			// Use rspack's CopyRspackPlugin instead of CopyWebpackPlugin
			const CopyPlugin =
				currentBundler.name === "rspack"
					? (
							currentBundler.instance as unknown as {
								CopyRspackPlugin: typeof CopyWebpackPlugin;
							}
						).CopyRspackPlugin
					: CopyWebpackPlugin;

			return {
				plugins: [
					// Copy Cesium static files
					new CopyPlugin({
						patterns: [
							{
								from: path.join(cesiumSource, "Workers"),
								to: `${cesiumBaseUrl}/Workers`,
							},
							{
								from: path.join(cesiumSource, "ThirdParty"),
								to: `${cesiumBaseUrl}/ThirdParty`,
							},
							{
								from: path.join(cesiumSource, "Assets"),
								to: `${cesiumBaseUrl}/Assets`,
							},
							{
								from: path.join(cesiumSource, "Widgets"),
								to: `${cesiumBaseUrl}/Widgets`,
							},
						],
					}),
					// Define global constants for the runtime
					// 从 .env 文件读取
					new currentBundler.instance.DefinePlugin({
						// Cesium 静态资源跟随部署根路径
						CESIUM_BASE_URL: JSON.stringify(`${SITE_BASE_URL}${cesiumBaseUrl}`),
						CESIUM_ACCESS_TOKEN: JSON.stringify(
							process.env.CESIUM_ACCESS_TOKEN || "",
						),
					}),
				],
			};
		},
	};
}

import type { Plugin } from "@docusaurus/types";

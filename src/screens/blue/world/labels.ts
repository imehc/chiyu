import {
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	type Vector3,
} from "three";
import type SceneTextures from "./textures";

export default class MapLabels {
	readonly surfaceLabels: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
	constructor(private readonly textures: SceneTextures) {}

	create(
		name: string,
		position: Vector3,
		leaf = false,
		pixels = leaf ? 16 : 14,
		variant: "region" | "context" = "region",
		spatialScale = 1,
	) {
		const contextLabel = variant === "context";
		const textureWidth = contextLabel
			? name.length * 56 + 112
			: Math.max(96, name.length * 64 + 32);
		const texture = this.textures.canvas(textureWidth, 96, (context) => {
			context.font = `${contextLabel ? "600 54" : "500 64"}px "Alibaba PuHuiTi", "PingFang SC", sans-serif`;
			context.textAlign = "center";
			context.textBaseline = "middle";
			if (contextLabel) {
				context.fillStyle = "rgba(2, 10, 19, .9)";
				context.fillRect(4, 8, textureWidth - 8, 80);
				context.strokeStyle = "rgba(133, 186, 201, .75)";
				context.lineWidth = 2;
				context.strokeRect(18, 28, 52, 40);
				context.beginPath();
				context.moveTo(21, 31);
				context.lineTo(67, 65);
				context.moveTo(21, 65);
				context.lineTo(67, 31);
				context.stroke();
				context.fillStyle = "#edfaff";
				context.fillRect(35, 41, 18, 14);
			}
			context.shadowColor = "#061425";
			context.shadowBlur = 6;
			context.fillStyle = contextLabel ? "#e6f3ff" : "#deefff";
			context.fillText(name, (textureWidth + (contextLabel ? 76 : 0)) / 2, 48);
		});
		const height = (pixels / 14) * (contextLabel ? 0.7 : 0.42) * spatialScale;
		const label = new Mesh(
			new PlaneGeometry((height * textureWidth) / 96, height),
			new MeshBasicMaterial({
				map: texture,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				depthTest: true,
				toneMapped: false,
				side: DoubleSide,
			}),
		);
		label.name = `MapSurfaceLabel-${name}`;
		label.userData.mapName = {
			variant,
			surfaceHeight: position.z,
			riseDepth: 0.85 * spatialScale,
		};
		label.position.copy(position);
		if (contextLabel) label.position.z -= 0.85 * spatialScale;
		label.renderOrder = 14;
		label.raycast = () => undefined;
		this.surfaceLabels.push(label);
		return label;
	}
}

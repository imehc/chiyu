/**
 * 场景文字标注：把省名、市名与周边国名绘制成平铺在地图表面的平面 Mesh，
 * 配合 frame 控制器做淡入与「从地图里升起」的动画。
 * 被 ChinaScene 与 Subdivisions 通过注入的 create 回调使用，贴图由 SceneTextures 提供。
 */
import {
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	type Vector3,
} from "three";
import type SceneTextures from "./textures";

/**
 * 地图表面标注工厂。
 * 与 Sprite 版铭牌不同，这里用真实平面几何体，能按世界坐标缩放并贴合在立体块顶面上。
 */
export default class MapLabels {
	/** 已创建的全部标注，供控制器统一控制透明度与销毁 */
	readonly surfaceLabels: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
	constructor(private readonly textures: SceneTextures) {}

	/**
	 * 创建一条地图标注。
	 * @param name 显示文字，如「广东省」
	 * @param position 世界坐标位置，通常为该级质心并抬到对应顶面高度
	 * @param leaf 是否为最末级（区县）标注，影响默认字号
	 * @param pixels 逻辑字号（像素），默认省级 14、末级 16
	 * @param variant region 为省内标签，context 为周边国家标签（带旗标底框、更暗）
	 * @param spatialScale 层级缩放系数，下钻越深标注越小
	 * @returns 生成的平面标注，userData.mapName 中带有动画所需的元数据
	 */
	create(
		name: string,
		position: Vector3,
		leaf = false,
		pixels = leaf ? 16 : 14,
		variant: "region" | "context" = "region",
		spatialScale = 1,
	) {
		const contextLabel = variant === "context";
		// 贴图宽度按字数估算：周边国名 56px/字（字号更小），省内名称 64px/字，且至少保留 96px
		const textureWidth = contextLabel
			? name.length * 56 + 112
			: Math.max(96, name.length * 64 + 32);
		const texture = this.textures.canvas(textureWidth, 96, (context) => {
			context.font = `${contextLabel ? "600 54" : "500 64"}px "Alibaba PuHuiTi", "PingFang SC", sans-serif`;
			context.textAlign = "center";
			context.textBaseline = "middle";
			if (contextLabel) {
				// 周边国名的底框：深色半透明底 + 一个手绘的「旗帜」图形，用来与省内标注区分
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
		// 平面高度 = 字号相对 14 的倍数 × 变体系数（context 0.7、region 0.42）× 层级缩放；
		// 宽度按贴图 宽度/96 的比例换算，保持文字不被横向拉伸
		const height = (pixels / 14) * (contextLabel ? 0.7 : 0.42) * spatialScale;
		const label = new Mesh(
			new PlaneGeometry((height * textureWidth) / 96, height),
			new MeshBasicMaterial({
				map: texture,
				transparent: true,
				// 初始全透明，由入场动画逐步写到目标透明度
				opacity: 0,
				depthWrite: false,
				depthTest: true,
				// 关闭色调映射，避免文字被 bloom 与 tone mapping 压暗、发灰
				toneMapped: false,
				side: DoubleSide,
			}),
		);
		label.name = `MapSurfaceLabel-${name}`;
		// 记录基准高度与升起位移，frame.mapName 据此把标签从面片内部抬到目标位置
		label.userData.mapName = {
			variant,
			surfaceHeight: position.z,
			riseDepth: 0.85 * spatialScale,
		};
		label.position.copy(position);
		// 周边国名先沉到地表之下，入场时再升回 surfaceHeight，形成从地图里浮出的效果
		if (contextLabel) label.position.z -= 0.85 * spatialScale;
		// 排在高序号，确保压在色块、描边与光晕之上
		label.renderOrder = 14;
		// 清空 raycast：标签不参与拾取，否则会挡住省份的悬停与点击
		label.raycast = () => undefined;
		this.surfaceLabels.push(label);
		return label;
	}
}

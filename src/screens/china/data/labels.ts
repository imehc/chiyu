/**
 * 全国大屏的纯文字省份标签（演示数据）。
 * 消费方：world.ts 的 createLabel → createMapLabels，
 * 投影后渲染成 CSS3D 标签并参与入场时间线的错峰淡入。
 */
export interface ChinaLabelPoint {
	/** 中文省名，标签主文案 */
	name: string;
	/** 英文名，作为标签副标题；沿用官方对外译名（如 TAIWAN, CHINA） */
	enName: string;
	/** 标签锚点，[经度, 纬度]，通常取省会坐标而非几何中心 */
	center: [number, number];
	/** 是否加模糊衬底，长英文名压在地图亮部时可提升可读性 */
	blur?: boolean;
}

/**
 * 全国大屏省份标签。
 * 只保留没有指标柱、且区域相对空旷的省份，
 * 密度与广东大屏的周边省份标签保持一致，避免和柱体标签、信息卡叠压。
 */
const chinaLabelPoints: ChinaLabelPoint[] = [
	{ name: "西藏", enName: "XIZANG", center: [91.132212, 29.660361] },
	{ name: "青海", enName: "QINGHAI", center: [96.778031, 36.623178] },
	{
		name: "内蒙古",
		enName: "INNER MONGOLIA",
		center: [111.670801, 40.818311],
	},
	{ name: "云南", enName: "YUNNAN", center: [102.712251, 25.040609] },
	{ name: "台湾", enName: "TAIWAN, CHINA", center: [121.509062, 25.044332] },
];

export default chinaLabelPoints;

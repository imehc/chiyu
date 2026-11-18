export interface ChinaLabelPoint {
	name: string;
	enName: string;
	center: [number, number];
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

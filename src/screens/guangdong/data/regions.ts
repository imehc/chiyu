/**
 * 广东省 21 个地级市的示例指标（含广州）。
 *
 * 字段：
 * - name：市名全称，用于柱顶标签展示；底图上的区县高亮由 GeoJSON 自身的 userData.name 驱动；
 * - enName：英文名，柱顶标签的第二行小字；
 * - center：[经度, 纬度]，行政驻地，用作标签锚点；
 * - centroid：[经度, 纬度]，辖区几何重心，光柱与飞线落点用它，避免柱子挤在城区一侧；
 * - value：指标示例值（常住人口口径），单位万人，仅决定柱高比例与排名，不代表真实统计。
 *
 * 由 world.ts 消费：createBar 先 sortByValue 原地降序、再 filter 取前 7 根光柱，
 * 只留 7 个是为了避免 21 个地市在珠三角挤成一团、标签互相叠压，同时让方位分散；
 * createFlyLine 复用同一批前 7 项，终点取 centroid，与光柱一一对应。
 * 按当前数值会选中广州、深圳、珠海、汕头、佛山、茂名、湛江，其余城市只出现在底图上。
 * enName 中保留了几处历史拼写（saoguan、foushan、jiqing 等），仅用于标签展示，不影响投影定位。
 */
export default [
	{
		// 广州同时是飞线汇聚点，柱顶标签的 value 即 100（归一化基准），入场时跳过它的光柱生长
		name: "广州市",
		enName: "guangzhou",
		// 行政驻地 [经度, 纬度]，标签锚点
		center: [113.280637, 23.125178],
		// 辖区重心 [经度, 纬度]，光柱与飞线从这里出发
		centroid: [113.544372, 23.329249],
		// 单位：万人，同时是柱高归一化的分母（最大值 100）
		value: 100,
	},
	{
		name: "韶关市",
		enName: "saoguan",
		center: [113.591544, 24.801322],
		centroid: [113.779323, 24.81941],
		value: 32,
	},
	{
		name: "深圳市",
		enName: "shenzhen",
		center: [114.085947, 22.547],
		centroid: [114.143142, 22.643377],
		value: 79,
	},
	{
		name: "珠海市",
		enName: "zhuhai",
		center: [113.553986, 22.224979],
		centroid: [113.337286, 22.160135],
		value: 68,
	},
	{
		name: "汕头市",
		enName: "shantou",
		center: [116.708463, 23.37102],
		centroid: [116.575361, 23.322231],
		value: 56,
	},
	{
		name: "佛山市",
		enName: "foushan",
		center: [113.122717, 23.028762],
		centroid: [112.949778, 23.004314],
		value: 52,
	},
	{
		name: "江门市",
		enName: "jiangmen",
		center: [113.094942, 22.590431],
		centroid: [112.676451, 22.284348],
		value: 18,
	},
	{
		name: "湛江市",
		enName: "zhanjiang",
		center: [110.364977, 21.274898],
		centroid: [110.109828, 21.047893],
		value: 48,
	},
	{
		name: "茂名市",
		enName: "maoming",
		center: [110.919229, 21.659751],
		centroid: [110.958736, 22.008884],
		value: 51,
	},
	{
		name: "肇庆市",
		enName: "jiqing",
		center: [112.472529, 23.051546],
		centroid: [112.210411, 23.536359],
		value: 26,
	},
	{
		name: "惠州市",
		enName: "huizhou",
		center: [114.412599, 23.079404],
		centroid: [114.507032, 23.234461],
		value: 23,
	},
	{
		name: "梅州市",
		enName: "meizhou",
		center: [116.117582, 24.299112],
		centroid: [116.084478, 24.201791],
		value: 26,
	},
	{
		name: "汕尾市",
		enName: "sanwei",
		center: [115.364238, 22.774485],
		centroid: [115.53778, 23.004558],
		value: 18,
	},
	{
		name: "河源市",
		enName: "heyuan",
		center: [114.697802, 23.746266],
		centroid: [114.962729, 24.043541],
		value: 30,
	},
	{
		name: "阳江市",
		enName: "yangjiang",
		center: [111.975107, 21.859222],
		centroid: [111.779569, 22.02617],
		value: 31,
	},
	{
		name: "清远市",
		enName: "qingyuan",
		center: [113.051227, 23.685022],
		centroid: [112.879397, 24.313361],
		value: 32,
	},
	{
		name: "东莞市",
		enName: "dongguan",
		center: [113.746262, 23.046237],
		centroid: [113.879966, 22.931879],
		value: 22,
	},
	{
		name: "中山市",
		enName: "zhongshan",
		center: [113.382391, 22.521113],
		centroid: [113.398784, 22.517323],
		value: 18,
	},
	{
		name: "潮州市",
		enName: "chaozhou",
		center: [116.632301, 23.661701],
		centroid: [116.790217, 23.783155],
		value: 22,
	},
	{
		name: "揭阳市",
		enName: "xieyang",
		center: [116.355733, 23.543778],
		centroid: [116.124317, 23.334057],
		value: 31,
	},
	{
		name: "云浮市",
		enName: "yunfu",
		center: [112.044439, 22.929801],
		centroid: [111.798791, 22.813664],
		value: 27,
	},
];

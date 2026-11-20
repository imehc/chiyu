/**
 * 世界场景共用常量：地球归位/聚焦姿态、轨道与扫描球半径、中国地图拉伸厚度以及动画时长。
 * 被 globe.ts、china.ts、subdivisions.ts 与 camera/view/regions 等控制器共同引用，
 * 这里的数值同时决定几何尺寸和补间节奏，改动会牵动整个场景的比例关系。
 */

/** 地球「归位」姿态（弧度为单位的欧拉角）：y 接近 π 使中国所在经度朝向镜头，x 略微俯视 */
export const GLOBE_HOME = { x: 0.43, y: Math.PI + 0.12, z: 0.04 };
/** 由全球视图切向中国视图时球体的目标姿态（弧度），相对归位姿态向中国一侧微偏 */
export const CHINA_GLOBE_FOCUS = { x: 0.59, y: Math.PI - 0.27, z: 0 };
// 地球本体半径为 5.1 世界单位，光带浮在球外约 2.15 个单位处，避免贴到地表
/** 环绕光带的椭圆半径（世界坐标），同时作为雾状光晕 shader 的中心线 */
export const GLOBE_ORBIT_RADIUS = 7.25;
// 必须大于云层球壳的 5.145，否则扫描带会与云层深度冲突并闪烁
/** 扫描球壳半径（世界坐标），也是相机贴边淡出的参考球 */
export const GLOBE_SCAN_RADIUS = 5.9;
/** 中国省级多边形沿 z 轴的拉伸厚度（世界坐标），下钻时子级图层以此为基面向上堆叠 */
export const CHINA_MAP_DEPTH = 0.48;
/** 中国地图入场动画的起始延迟（秒），等云层过渡落定后再开始抬升，避免两段动画打架 */
export const CHINA_ENTRANCE_DELAY = 0.65;
/** 省/市/区县下钻时镜头过渡的固定时长（秒） */
export const REGION_TRANSITION_DURATION = 1.8;

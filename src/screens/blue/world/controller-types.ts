/**
 * 控制器聚合类型：把相机、镜头、视图、下钻、子级、交互、渲染与资源八个控制器
 * 组装成一个可整体传递的接口。
 * BlueWorld 负责实例化并持有，WorldState 及各控制器通过 `() => WorldControllers`
 * 惰性访问彼此，避免构造期的循环依赖。
 */
import type WorldCamera from "./camera";
import type CameraMotion from "./camera-motion";
import type WorldFrame from "./frame";
import type WorldInteraction from "./interaction";
import type RegionNavigation from "./regions";
import type WorldResources from "./resources";
import type Subdivisions from "./subdivisions";
import type WorldView from "./view";

/**
 * 场景控制器的聚合视图，字段名即调用时的能力名（如 controllers().camera.zoom）。
 * 所有字段在 BlueWorld 构造期一次性赋值，之后只读取不替换。
 */
export interface WorldControllers {
	/** 相机位姿计算、缩放、俯视与地图旋转补偿 */
	camera: WorldCamera;
	/** 首屏入场、视图切换与下钻的镜头补间编排 */
	cameraMotion: CameraMotion;
	/** 顶层视图切换、图层开关与重置 */
	view: WorldView;
	/** 行政区下钻/返回的层级导航 */
	regions: RegionNavigation;
	/** 下钻层内部子级（区县）的加载与标注 */
	subdivisions: Subdivisions;
	/** 指针拾取、拖拽、悬停与监测点弹窗 */
	interaction: WorldInteraction;
	/** 渲染循环与地名逐帧刷新 */
	frame: WorldFrame;
	/** 资源加载、预热与销毁 */
	resources: WorldResources;
}

/**
 * 全局事件总线：基于 mitt 的单例，原用于地图场景与 UI 层解耦通信，当前未被任何模块引用。
 * 事件表在此集中声明，发布方与订阅方共享同一份类型，改名或改 payload 时能被类型检查发现。
 * 注意它是模块级单例，跨大屏切换时订阅方必须在卸载处调用 $off，否则旧回调会继续被触发。
 */
import mitt from "mitt";
import type Assets from "../shared/map/assets";

/** 事件名 → payload 类型；payload 可省略，因此订阅回调里要按需判空 */
type Events = {
	/** 地图资源（贴图、GeoJSON 等）加载完成，回调收到资源集合 */
	loadMap?: Assets;
	/** 地图播放完成（入场镜头结束），UI 据此开始面板入场动画 */
	mapPlayComplete?: () => void;
};

const emitter = mitt<Events>();

export default {
	/**
	 * 订阅事件。
	 * 同一个事件可以挂多个 handler，按注册顺序依次触发。
	 */
	$on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void) {
		emitter.on(event, handler);
	},

	/**
	 * 取消监听（必须传入同一个 handler 函数引用）。
	 * 传入新的匿名函数不会生效，因为 mitt 按引用比较；
	 * 组件的 onCleanup 里退订时务必复用订阅时的函数。
	 */
	$off<K extends keyof Events>(
		event: K,
		handler: (payload: Events[K]) => void,
	) {
		emitter.off(event, handler);
	},

	/**
	 * 触发事件（payload 可选）。
	 * 同步执行所有订阅者，异常会向上冒泡，不要在 handler 里做重活。
	 */
	$emit<K extends keyof Events>(event: K, payload?: Events[K]) {
		emitter.emit(event, payload);
	},

	/**
	 * 只订阅一次。
	 * 包装函数先执行原 handler 再退订自己，因此 handler 内部抛错时订阅不会被移除，
	 * 需要在异常场景下自动解绑的调用方要自行处理。
	 */
	$once<K extends keyof Events>(
		event: K,
		handler: (payload: Events[K]) => void,
	) {
		const onceHandler = (payload: Events[K]) => {
			handler(payload);
			// 退订的是包装函数本身，不能用 handler，否则引用不同删不掉
			emitter.off(event, onceHandler);
		};
		// 注册的也是包装函数，保证 on/off 成对
		emitter.on(event, onceHandler);
	},
};

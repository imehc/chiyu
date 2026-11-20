/**
 * 极简事件总线：资源加载（onProgress/onLoad/onError）与渲染时钟（tick）共用。
 * 被 Resource、Time 继承使用，再由 Map3D 与场景层订阅；泛型约束保证事件名与回调参数一一对应。
 */
// 1. 事件名 → 参数类型的映射
interface EventMap {
	onProgress: [url: string, loaded: number, total: number];
	onError: [error: Error | string | unknown];
	onLoad: [];
	tick: [delta: number, elapsedTime: number];
	resize: [];
}

// 2. 辅助类型
type EventName = keyof EventMap;
type EventCallback<T extends EventName> = (...args: EventMap[T]) => void;

export default class EventEmitter {
	// 3. 内部容器：事件名 → 回调函数 Set。用 Set 保证同一回调重复订阅不会重复触发
	private readonly events: Map<EventName, Set<EventCallback<EventName>>>;

	constructor() {
		this.events = new Map<EventName, Set<EventCallback<EventName>>>();
	}

	/**
	 * 监听事件。必须在销毁阶段用 off 成对解绑，否则闭包里持有的场景对象无法回收。
	 * @param event 事件名
	 * @param callback 回调，参数类型随事件名推导
	 */
	on<T extends EventName>(event: T, callback: EventCallback<T>): void {
		let callbacks = this.events.get(event);
		if (!callbacks) {
			callbacks = new Set<EventCallback<EventName>>();
			this.events.set(event, callbacks);
		}
		callbacks.add(callback as EventCallback<EventName>); // 断言是兼容的
	}

	/**
	 * 取消监听。
	 * @param callback 省略时会清空该事件的全部订阅，用于 destroy 一次性收尾
	 */
	off<T extends EventName>(event: T, callback?: EventCallback<T>): void {
		if (!callback) {
			// 如果不给回调，就把整个事件清掉
			this.events.delete(event);
			return;
		}

		const callbacks = this.events.get(event);
		if (!callbacks) return;
		callbacks.delete(callback as EventCallback<EventName>);

		// 如果 Set 空了，顺手把 key 也删掉
		if (callbacks.size === 0) this.events.delete(event);
	}

	/**
	 * 触发事件，同步按订阅顺序调用回调。
	 * 遍历的是 Set 本身，回调内若对同一事件 off/on 会影响迭代，因此业务回调里应避免改动订阅。
	 */
	emit<T extends EventName>(event: T, ...args: EventMap[T]): void {
		const callbacks = this.events.get(event);
		if (!callbacks) return;
		// 直接遍历 Set：回调里若 off 当前事件会改动集合，可能漏掉后续订阅者
		callbacks.forEach((callback) => {
			callback(...args);
		});
	}

	/**
	 * 只触发一次的监听：包装函数先执行回调，再把自己从事件表移除。
	 */
	once<T extends EventName>(event: T, callback: EventCallback<T>): void {
		const onceWrapper = (...args: EventMap[T]) => {
			callback(...args);
			this.off(event, onceWrapper as EventCallback<T>);
		};
		this.on(event, onceWrapper as EventCallback<T>);
	}
}

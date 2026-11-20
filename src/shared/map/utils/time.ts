/**
 * 逐帧时钟：基于 requestAnimationFrame 驱动，每帧广播 tick(delta, elapsedTime)。
 * 被 Map3D 的 world 持有，是场景内所有自发动画（贴图滚动、旋转边框、shader 时间）的唯一时间源。
 */
import { Clock } from "three";
import EventEmitter from "./event-emitter";
import requestAnimationFrameFn from "./request-animation-frame";

export default class Time extends EventEmitter {
    private _start: number;
    private _current: number;
    private _elapsed: number;
    private _delta: number;
    /** Three.js 的 Clock，用于提供稳定、与系统时间无关的 delta / elapsed */
    private _clock: Clock;
    /** 底层 rAF 循环句柄，pause/resume 都转交给它 */
    private _raf: ReturnType<typeof requestAnimationFrameFn>;

    constructor() {
        super();
        // 构造即启动循环；需要暂停时由外部显式调用 pause（loadMap 会先暂停再等 play）
        this._start = Date.now();
        this._current = this._start;
        this._elapsed = 0;
        this._delta = 16; // 首帧前的默认值，取 16ms ≈ 60fps，避免用 0 参与除法
        this._clock = new Clock();
        this._raf = requestAnimationFrameFn(() => this.tick());
        this._raf.start();
    }
    /** 每帧被 rAF 调用：更新计时字段后向外广播 */
    tick() {
        const currentTime = Date.now();
        this._delta = currentTime - this._current;
        this._current = currentTime;
        this._elapsed = this._current - this._start;
        // 对外广播用 Clock 的 delta：它不受系统时间跳变影响，单位是秒
        const delta = this._clock.getDelta();
        const elapsedTime = this._clock.getElapsedTime();
        this.emit("tick", delta, elapsedTime);
    }
    /** 销毁：先停帧再清空订阅，避免停之前还有一帧回调打到已销毁的场景 */
    destroy() {
        this.pause();
        this.off("tick");
    }
    /** 暂停逐帧循环，切屏或页面不可见时调用 */
    pause() {
        this._raf.pause();
    }
    /** 恢复逐帧循环 */
    resume() {
        this._raf.resume();
    }
    isActive() {
        // 转发底层 rAF 的活跃状态；此处未 return，调用方拿到的是 undefined，仅供调试观察
        this._raf.isActive();
    }
}
/**
 * 视口尺寸管理：读取画布父节点的 CSS 尺寸与设备像素比，并在窗口 resize 时广播。
 * 被渲染器与相机构造时使用——渲染缓冲要按「CSS 尺寸 × 像素比」设定，否则高 DPI 屏会发虚。
 */
import EventEmitter from "./event-emitter";

interface SizesOption {
    canvas: HTMLCanvasElement;
}

/**
 * 维护 width / height / pixelRatio 三项，并在 resize 时发事件。
 * 尺寸取父节点而非 canvas 本身：canvas 是 size-full 撑满父级的，父节点才代表可用视口。
 */
export class Sizes extends EventEmitter {
    private _canvas: HTMLCanvasElement;
    /** 设备像素比固定为 2（构造时直接赋值），1x 屏也按 2 倍渲染 */
    private _pixelRatio: number;
    /** CSS 像素宽度（未乘像素比） */
    private _width: number = 0;
    /** CSS 像素高度（未乘像素比） */
    private _height: number = 0;

    /**
     * 设备像素比。调用方按「width * pixelRatio」设置渲染缓冲、
     * 再按「width / height」设置相机投影，二者配合才能在 Retina 屏上既不模糊也不变形。
     */
    get pixelRatio() {
        return this._pixelRatio;
    }

    /** 视口宽度，单位 CSS 像素 */
    get width() {
        return this._width;
    }

    /** 视口高度，单位 CSS 像素 */
    get height() {
        return this._height;
    }

    constructor({ canvas }: SizesOption) {
        super();
        this._canvas = canvas;
        // 先给 2 作为初值，init 里的 `||` 因此不会覆盖它，相当于固定上限 2
        this._pixelRatio = 2;
        this.init();
        window.addEventListener("resize", () => {
            this.init();
            this.emit("resize");
        });
    }
    /**
     * 重新测量父节点尺寸。
     * 注意：构造函数里注册的是匿名 resize 监听，destroy 无法引用它精确移除，
     * 因此这里只负责刷新数值，监听本身会随页面存活。
     */
    init() {
        // 读取的是父级容器的布局尺寸：canvas 自身被 CSS 撑满，直接量它会得到实时值但拿不到容器基准
        this._width = (this._canvas.parentNode as HTMLElement | null)?.offsetWidth || 0;
        this._height = (this._canvas.parentNode as HTMLElement | null)?.offsetHeight || 0;
        // 保持已有值；若为 0 才回退到设备像素比，且封顶 2 防止高 DPI 屏过载
        this._pixelRatio = this._pixelRatio || Math.min(window.devicePixelRatio, 2);
    }
    destroy() {
        // 只清空本总线上的 resize 订阅，window 上的匿名监听仍会生效
        this.off("resize");
    }
}

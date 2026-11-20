/**
 * 上升粒子：在立方体空间内随机分布的发光点，沿 +Z 匀速漂移并越界回绕，
 * 用 Points + 圆形渐变贴图营造「数据流动」的氛围。
 * 由大屏 world 创建，setParent 后订阅 Time 的 tick 驱动位移。
 */
import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    type HSL,
    type Object3D,
    Points,
    PointsMaterial,
} from "three";
import type Time from "../../utils/time";

/**
 * 运行时依赖。
 */
interface ParticlesConfig {
    /** 帧循环，用于驱动粒子位移 */
    time: Time;
}

/** 选项类型即默认选项的结构 */
type ParticlesOption = typeof defaultOption;

/**
 * 粒子系统。
 * 材质开启 AdditiveBlending 并关闭深度测试：粒子之间相互叠加提亮，
 * 适合表现半透明的能量感，但也因此不参与正确的遮挡关系。
 */
export default class Particles {
    #time: Time;
    #option: ParticlesOption;
    /** 是否参与更新，外部可通过 enable 一次性暂停/恢复全部粒子 */
    #enable: boolean;
    /** Points 实例，create 之前为 null */
    #instance: Points | null = null;

    /**
     * @param config 帧循环依赖
     * @param option 数量、范围、颜色等覆盖值
     */
    constructor(config: ParticlesConfig, option: Partial<ParticlesOption>) {
        this.#time = config.time;
        this.#enable = true;
        this.#option = Object.assign({}, defaultOption, option);
        this.create();
    }

    /** 取 Points 实例，可用于改整体可见性或材质参数 */
    get instance() {
        return this.#instance;
    }

    /** 当前是否参与逐帧更新 */
    get enable() {
        return this.#enable;
    }

    set enable(value: boolean) {
        this.#enable = value;
    }

    /**
     * 生成圆形渐变贴图：中心纯白不透明，边缘完全透明。
     * 作为 PointsMaterial.map 使用，让方形的点精灵看起来像柔和光点。
     * @returns 1024×1024 的 CanvasTexture；圆半径取画布一半，正好内切不浪费纹素
     */
    static createTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Failed to get 2D context");
        }
        const gradient = context.createRadialGradient(512, 512, 0, 512, 512, 512);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1024, 1024);
        const texture = new CanvasTexture(canvas);
        return texture;
    }

    /**
     * 创建粒子几何，写入三个顶点属性：
     * position 为初始位置，velocities 为每颗粒子的速度种子（并非真实速度，
     * 位置在 update 里逐帧累加），color 为随机压暗后的顶点色。
     */
    create() {
        const { range, dir, material, num, renderOrder } = this.#option;
        const position = [];
        const colors = [];
        const velocities = [];
        for (let i = 0; i < num; i++) {
            // 在边长 range 的立方体内均匀撒点，再整体平移到以原点为中心
            position.push(
                Math.random() * range - range / 2,
                Math.random() * range - range / 2,
                Math.random() * range - range / 2,
            );
            // up 表示沿 +Z 上升，down 取负；这些随机值只做扰动，
            // 实际位移以 speed * dirVec 为准
            const dirVec = dir === "up" ? 1 : -1;
            velocities.push(
                Math.random() * dirVec,
                (0.1 + Math.random()) * dirVec,
                0.1 + Math.random() * dirVec,
            );
            // 在基础色上随机压暗明度，使粒子有明暗层次而非一片死白
            const color = material.color.clone();
            const hsl: HSL = {} as HSL;
            color.getHSL(hsl);
            color.setHSL(hsl.h, hsl.s, hsl.l * Math.random());
            colors.push(color.r, color.g, color.b);
        }
        const geometry = new BufferGeometry();
        // 三个属性都是每顶点 3 个 float，依次对应 xyz / 速度 / rgb
        geometry.setAttribute(
            "position",
            new BufferAttribute(new Float32Array(position), 3),
        );
        geometry.setAttribute(
            "velocities",
            new BufferAttribute(new Float32Array(velocities), 3),
        );
        geometry.setAttribute(
            "color",
            new BufferAttribute(new Float32Array(colors), 3),
        );
        this.#instance = new Points(geometry, material);
        this.#instance.renderOrder = renderOrder;
    }

    /**
     * 逐帧推进粒子。
     * 只改 position 的 X/Z 与 Z 方向回绕；velocities 读回后原样写回，
     * 当前并未真正参与位移积分，只借 vel_x 做正弦横向扰动。
     * @param delta 帧间隔（秒），X 方向的扰动幅度按它缩放
     * @param elapsedTime 累计运行时间（秒），决定正弦扰动的相位
     */
    update(delta: number, elapsedTime: number) {
        if (!this.instance) return;
        const { range, speed, dir } = this.#option;
        const dirVec = dir === "up" ? 1 : -1;
        const position = this.instance.geometry.getAttribute("position");
        const velocities = this.instance.geometry.getAttribute("velocities");
        const count = position.count;
        for (let i = 0; i < count; i++) {
            let pos_x = position.getX(i);
			/** const pos_y = */ position.getY(i);
            let pos_z = position.getZ(i);
            const vel_x = velocities.getX(i);
            const vel_y = velocities.getY(i);
			/** const vel_z = */velocities.getZ(i);
            pos_x += Math.sin(vel_x * elapsedTime) * delta;
            pos_z += speed * dirVec;
            // 越过边界后从另一侧回绕，形成无限循环的粒子流
            if (pos_z > range / 2 && dirVec === 1) {
                pos_z = -range / 2;
            }
            if (pos_z < -range / 2 && dirVec === -1) {
                pos_z = range / 2;
            }
            position.setX(i, pos_x);
            position.setZ(i, pos_z);
            velocities.setX(i, vel_x);
            velocities.setY(i, vel_y);
        }
        // 手动标记 needsUpdate，WebGL 才会在下一帧把属性重新上传到 GPU
        position.needsUpdate = true;
        velocities.needsUpdate = true;
    }

    /**
     * 把粒子挂到父节点并开始按帧更新。
     * 注意每调用一次都会新增一个 tick 监听，重复调用会导致位移被重复累加。
     */
    setParent(parent: Object3D) {
        parent.add(this.#instance as Object3D);
        this.#time.on("tick", (delta, elapsedTime) => {
            if (this.#enable) {
                this.update(delta, elapsedTime);
            }
        });
    }
}

/**
 * 默认选项。
 * range 500 是粒子活动立方体的边长；renderOrder 99 让它后画、压在场景之上；
 * size 20 配合 sizeAttenuation，近处光点更大，形成纵深。
 */
const defaultOption = {
    num: 100,
    range: 500,
    speed: 0.01,
    renderOrder: 99,
    dir: "up",
    material: new PointsMaterial({
        map: Particles.createTexture(),
        size: 20,
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        depthTest: false,
        vertexColors: true,
        blending: AdditiveBlending,
        sizeAttenuation: true,
    }),
};

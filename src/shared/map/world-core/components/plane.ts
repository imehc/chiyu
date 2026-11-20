/**
 * 通用平面：一块可选的半透明贴图平面，用于地图上的光晕、水波等叠加层。
 * 开启 needRotate 后可绕 Z 轴缓慢自转，常配合圆形贴图做旋转光效。
 * 由场景层创建，几何默认躺在 XY 平面，需要水平放置时由使用方自行 rotateX。
 */
import { Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Vector3 } from "three";
import type Time from "../../utils/time";

/**
 * 运行时依赖：帧循环，仅在需要自转时使用。
 */
interface PlaneConfig {
    time: Time
}

/** 选项类型即默认选项的结构 */
type PlaneOption = typeof defaultOption

/**
 * 默认选项。
 * width 同时作为宽高，得到正方形平面；rotateSpeed 是每帧累加的角度（弧度），
 * 不按 delta 归一化，因此实际转速会随帧率变化。
 */
const defaultOption = {
    width: 10,
    scale: 1,
    position: new Vector3(0, 0, 0),
    needRotate: false,
    rotateSpeed: 0.001,
    material: new MeshBasicMaterial({
        transparent: true,
        opacity: 1,
        depthTest: true,
    }),
}



/**
 * 平面构建器。
 * 只做「几何 + 材质 + 变换」的组装，不参与图层顺序控制，
 * renderOrder 由使用方按叠加关系自行设置。
 */
export default class Plane {
    #time: Time;
    #option: PlaneOption;
    #instance: Mesh;

    /**
     * @param config 帧循环依赖
     * @param option 宽度、缩放、位置与旋转速度
     */
    constructor(config: PlaneConfig, option: Partial<PlaneOption>) {
        this.#time = config.time
        this.#option = Object.assign({}, defaultOption, option)
        const plane = new PlaneGeometry(this.#option.width, this.#option.width);
        const mesh = new Mesh(plane, this.#option.material);
        mesh.position.copy(this.#option.position);
        mesh.scale.set(this.#option.scale, this.#option.scale, this.#option.scale);
        this.#instance = mesh;
    }

    /** 取平面网格，供外部追加材质动画或层级设置 */
    get instance() {
        return this.#instance;
    }

    /** 挂到父节点并订阅 tick；只有 needRotate 为 true 时 update 才会改变旋转 */
    setParent(parent: Object3D) {
        parent.add(this.instance);
        this.#time.on("tick", () => {
            this.update();
        });
    }

    /** 每帧自转：绕 Z 轴累加固定角度，适合做缓慢旋转的雷达光效 */
    update() {
        if (this.#option.needRotate) {
            this.#instance.rotation.z += this.#option.rotateSpeed;
        }
    }
}
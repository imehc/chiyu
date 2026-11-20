/**
 * CSS3DSprite 的本地扩展：继承 Three.js 的 CSS3DSprite，
 * 预先声明标签管理器会动态挂载的实例方法（init / hide / show 等）。
 * 这里的空实现只用于补齐类型，实际行为由 Label3D.create 覆盖。
 */
import type { Object3D, Vector3Like } from 'three';
import { CSS3DSprite as ThreeCSS3DSprite } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

/**
 * 始终面向相机的 CSS3D 标签。
 * Sprite 会忽略父级旋转、每帧重新朝向相机，因此文字在任何视角下都不会侧过去，
 * 适合做地名、数值等需要始终可读的标注。
 */
export default class CSS3DSprite extends ThreeCSS3DSprite {

    /** 写入内容、设置位置并显示；空实现，运行时由 Label3D 覆盖 */
    init(_content: string, _position: Vector3Like) { }

    /** 通过 visibility 隐藏，DOM 仍保留在文档流中，不触发布局重算 */
    hide() { }

    /** 添加 scale-hidden 类做缩放隐藏，通常配合 CSS transition 播放收起动画 */
    scaleHide() { }

    /** 恢复显示并移除 scale-hidden 类 */
    show() { }

    /** 挂到指定父节点；空实现，运行时由 Label3D 覆盖 */
    setParent(_object3D: Object3D) { }
}
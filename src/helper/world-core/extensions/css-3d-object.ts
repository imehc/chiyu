import type { Object3D, Vector3Like } from 'three';
import { CSS3DObject as ThreeCSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

export default class CSS3DObject extends ThreeCSS3DObject {

    init(_content: string, _position: Vector3Like) { }

    hide() { }

    scaleHide() { }

    show() { }

    setParent(_object3D: Object3D) { }
}
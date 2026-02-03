import type { Object3D, Vector3Like } from 'three';
import { CSS3DSprite as ThreeCSS3DSprite } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

export default class CSS3DSprite extends ThreeCSS3DSprite {

    init(_content: string, _position: Vector3Like) { }

    hide() { }

    scaleHide() { }

    show() { }

    setParent(_object3D: Object3D) { }
}
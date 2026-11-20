/**
 * 地块材质：顶面渐变材质 + 侧面流动贴图材质，通过 onBeforeCompile 注入自定义 shader。
 * 由各屏 world 创建后交给 ExtrudeMap / BaseMap 使用，二者共享同一套配色与动画节奏。
 */
import {
	Color,
	DoubleSide,
	MeshLambertMaterial,
	MeshStandardMaterial,
	RepeatWrapping,
	type Texture,
} from "three";
import type Assets from "../assets";
import type Time from "../utils/time";

/**
 * 生成顶面与侧面两个材质，并把贴图流动动画绑到 time 上。
 * 顶面与侧面共用的 shader 注入与贴图动画都收敛在这里，避免两处配色走偏。
 * @param gradientWidth 顶面渐变在 x 方向上的跨度，通常传地图总宽度；
 * 数值越小渐变色带越窄，等于用地图宽度做归一化
 * @returns [顶面材质, 侧面材质]
 */
export function createMapMaterials(
	assets: Assets | undefined,
	time: Time,
	gradientWidth: string,
): [MeshLambertMaterial, MeshStandardMaterial] {
	const topMaterial = new MeshLambertMaterial({
		color: 0xffffff,
		transparent: true,
		// 初始全透明，入场时由 world 补间到可见，避免首帧闪白
		opacity: 0,
		fog: false,
		side: DoubleSide,
	});
	// 在兰伯特材质编译前注入 uniform 与 varying，实现按 x 坐标混合双色渐变
	topMaterial.onBeforeCompile = (shader) => {
		shader.uniforms = {
			...shader.uniforms,
			uColor1: { value: new Color(0x2a6e92) },
			uColor2: { value: new Color(0x102736) },
		};
		// alpha 是几何体自带的顶点属性（由地图组件写入），用它做逐顶点透明度
		shader.vertexShader = shader.vertexShader.replace(
			"void main() {",
			`
        attribute float alpha;
        varying vec3 vPosition;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vPosition = position;
      `,
		);
		shader.fragmentShader = shader.fragmentShader.replace(
			"void main() {",
			`
        varying vec3 vPosition;
        varying float vAlpha;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        void main() {
      `,
		);
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <opaque_fragment>",
			/* glsl */ `
      #ifdef OPAQUE
      diffuseColor.a = 1.0;
      #endif
            #ifdef USE_TRANSMISSION
      diffuseColor.a *= transmissionAlpha + 0.1;
      #endif
      vec3 gradient = mix(uColor1, uColor2, vPosition.x/${gradientWidth});
      outgoingLight = outgoingLight*gradient;
      float topAlpha = 0.5;
      if(vPosition.z>0.3){
        diffuseColor.a *= topAlpha;
      }
      gl_FragColor = vec4( outgoingLight, diffuseColor.a  );
      `,
		);
	};
	// 顶面渐变按 x 归一化（vPosition.x / gradientWidth），侧面渐变按高度 z 归一化，见下方 shader
	const sideMap = assets?.instance.getResource("side") as Texture;
	if (!sideMap) {
		throw new Error("sideMap is not found");
	}
	sideMap.wrapS = RepeatWrapping;
	sideMap.wrapT = RepeatWrapping;
	// 纵向重复 1.5 次并预置偏移，让首帧就能看到连续纹理而不是从头开始
	sideMap.repeat.set(1, 1.5);
	sideMap.offset.y += 0.065;
	const sideMaterial = new MeshStandardMaterial({
		color: 0xffffff,
		map: sideMap,
		fog: false,
		opacity: 0,
		side: DoubleSide,
	});
	time.on("tick", () => {
		// 侧面纹理沿 y 方向循环滚动，模拟墙体上流动的光带
		sideMap.offset.y += 0.005;
	});
	sideMaterial.onBeforeCompile = (shader) => {
		// 侧面渐变沿高度 z 展开（/1.2 是墙体高度归一化），并且两端同色，只保留贴图明暗
		shader.uniforms = {
			...shader.uniforms,
			uColor1: { value: new Color(0x2a6e92) },
			uColor2: { value: new Color(0x2a6e92) },
		};
		shader.vertexShader = shader.vertexShader.replace(
			"void main() {",
			`
        attribute float alpha;
        varying vec3 vPosition;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vPosition = position;
      `,
		);
		shader.fragmentShader = shader.fragmentShader.replace(
			"void main() {",
			`
        varying vec3 vPosition;
        varying float vAlpha;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        void main() {
      `,
		);
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <opaque_fragment>",
			/* glsl */ `
      #ifdef OPAQUE
      diffuseColor.a = 1.0;
      #endif
            #ifdef USE_TRANSMISSION
      diffuseColor.a *= transmissionAlpha + 0.1;
      #endif
      vec3 gradient = mix(uColor1, uColor2, vPosition.z/1.2);
      outgoingLight = outgoingLight*gradient;
      gl_FragColor = vec4( outgoingLight, diffuseColor.a  );
      `,
		);
	};
	// 顺序固定为 [顶面, 侧面]，调用方按位置解构，调换会导致地块上下颠倒
	return [topMaterial, sideMaterial];
}

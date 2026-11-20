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

/** Keeps the shared top / side shaders and their texture animation together. */
export function createMapMaterials(
	assets: Assets | undefined,
	time: Time,
	gradientWidth: string,
): [MeshLambertMaterial, MeshStandardMaterial] {
	const topMaterial = new MeshLambertMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0,
		fog: false,
		side: DoubleSide,
	});
	topMaterial.onBeforeCompile = (shader) => {
		shader.uniforms = {
			...shader.uniforms,
			uColor1: { value: new Color(0x2a6e92) },
			uColor2: { value: new Color(0x102736) },
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
	const sideMap = assets?.instance.getResource("side") as Texture;
	if (!sideMap) {
		throw new Error("sideMap is not found");
	}
	sideMap.wrapS = RepeatWrapping;
	sideMap.wrapT = RepeatWrapping;
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
		sideMap.offset.y += 0.005;
	});
	sideMaterial.onBeforeCompile = (shader) => {
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
	return [topMaterial, sideMaterial];
}

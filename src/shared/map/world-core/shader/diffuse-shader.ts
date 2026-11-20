/**
 * 扩散波纹着色器：向材质注入一段 GLSL，从平面原点向外扩散一圈带渐变宽度的光环，
 * 用于地图外围的雷达扫描效果。通过 material.onBeforeCompile 注入，
 * 因此不替换材质，基础着色流程与非注入时一致。
 */
import {
	Color,
	type MeshBasicMaterial,
	type WebGLProgramParametersWithUniforms,
} from "three";
import type Time from "../../utils/time";

/**
 * 着色器配置。
 */
interface DiffuseShaderConfig {
	/** 被注入的材质，需为 MeshBasicMaterial 系列（片元里会用到 diffuseColor / outgoingLight） */
	material: MeshBasicMaterial;
	/** 帧循环；当前未直接使用，uTime 由外部补间驱动 */
	time: Time;
	/** 扩散半径上限（世界单位），与 diffuseSpeed 共同决定一整圈的时长 */
	size?: number;
	/** 扩散速度（世界单位/秒），越大波纹推进越快 */
	diffuseSpeed?: number;
	/** 光环颜色 */
	diffuseColor?: number;
	/** 光环半宽（世界单位），决定渐变的过渡带宽度 */
	diffuseWidth?: number;
	/** 注入完成后的回调；触发时 uniforms 尚未挂载，取句柄需延后到下一帧 */
	callback?: (
		shader: WebGLProgramParametersWithUniforms,
		maxTime: number,
	) => void;
}

/**
 * 默认参数。
 * 半径 100、速度 15 意味着一圈约 6.7 秒；宽度 10 让光环有足够柔和的过渡。
 */
const defaultOption = {
	size: 100,
	diffuseSpeed: 15.0,
	diffuseColor: 0x8e9b9e,
	diffuseWidth: 10.0,
};

type DiffuseShaderOption = typeof defaultOption & {
	material: MeshBasicMaterial;
};

/**
 * 扩散着色器注入器。
 * 构造时即完成注入，无需再手动调用；shader 编译完成后可通过 pointShader 取到 uniform。
 */
export default class DiffuseShader {
	#time: DiffuseShaderConfig["time"];
	/** 编译后的 shader 参数对象，onBeforeCompile 触发前为 null */
	#pointShader: WebGLProgramParametersWithUniforms | null;
	#callback: DiffuseShaderConfig["callback"];
	#option: DiffuseShaderOption;

	/**
	 * @param config 材质与扩散参数，未传的参数项由 defaultOption 补齐
	 */
	constructor(config: DiffuseShaderConfig) {
		this.#time = config.time;
		this.#pointShader = null;
		this.#callback = config.callback;
		this.#option = Object.assign({}, defaultOption, {
			material: config.material,
			size: config.size,
			diffuseColor: config.diffuseColor,
			diffuseSpeed: config.diffuseSpeed,
			diffuseWidth: config.diffuseWidth,
		});
		this.init();
	}

	/** 帧循环，外部可用于驱动 uTime */
	get time() {
		return this.#time;
	}

	/** 取编译后的 shader 参数，用于读取或改写 uniform */
	get pointShader() {
		return this.#pointShader;
	}

	/**
	 * 注入 GLSL，分三步完成：
	 * 补充 uniform → 在顶点着色器透传局部坐标 → 在片元着色器里按距离重写输出颜色。
	 * onBeforeCompile 在材质首次参与渲染时触发，因此后续改动需要在回调内完成。
	 */
	init() {
		const { material, size, diffuseColor, diffuseSpeed, diffuseWidth } =
			this.#option;
		// 一圈跑满 size 所需的秒数，回调里可据此换算补间进度
		const maxTime = size / diffuseSpeed;

		material.onBeforeCompile = (shader) => {
			this.#pointShader = shader;
			this.#callback?.(shader, maxTime);
			// uniform 在每次编译时重建，uTime 交给外部补间写入
			shader.uniforms = {
				...shader.uniforms,
				uTime: {
					value: 0.0,
				},
				uSpeed: {
					value: diffuseSpeed,
				},
				uWidth: {
					value: diffuseWidth,
				},
				uColor: {
					value: new Color(diffuseColor),
				},
			};
			// 顶点着色器：把局部坐标 position 透传成 varying，
			// 片元里用它算到原点 (0,0) 的距离，即波纹半径
			shader.vertexShader = shader.vertexShader.replace(
				"void main() {",
				/* glsl */ `
            varying vec3 vPosition;
            void main(){
              vPosition = position;
          `,
			);
			// 片元着色器：必须先声明 uniform 与同名 varying，
			// 才能接住顶点阶段传下来的位置并参与后续计算
			shader.fragmentShader = shader.fragmentShader.replace(
				"void main() {",
				/* glsl */ `
            uniform float uTime;
            uniform float uSpeed;
            uniform float uWidth;
            uniform vec3 uColor;
            varying vec3 vPosition;
            void main(){
          `,
			);
			// 替换 opaque_fragment：Three.js 在这里才得到最终 outgoingLight 与 alpha，
			// 我们在此基础上按「距离是否落在环带内」决定混色或完全透明
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <opaque_fragment>",
				/* glsl */ `
            #ifdef OPAQUE
            diffuseColor.a = 1.0;
            #endif
            
            #ifdef USE_TRANSMISSION
            diffuseColor.a *= material.transmissionAlpha;
            #endif
            
            float r = uTime * uSpeed;
          
            float w = uWidth; 
            // if(w>uWidth){
            //   w = uWidth;
            // }else{
            //   w = uTime * 1.5;
            // }
           
            vec2 center = vec2(0.0, 0.0); 
           
            float rDistance = distance(vPosition.xy, center);
            
            if(rDistance > r && rDistance < r + 2.0 * w) {
              float per = 0.0;
              if(rDistance < r + w) {
                float p = smoothstep(0.0,1.0,(rDistance - r) / w);
                p*=p;
                outgoingLight = mix(outgoingLight, uColor, p);
              } else {
                
                float p = smoothstep(0.0,1.0,(rDistance - r - w) / w);
                
                outgoingLight = mix(uColor, outgoingLight, p);
              }
              gl_FragColor = vec4(outgoingLight, diffuseColor.a);
            } else {
              gl_FragColor = vec4(outgoingLight, 0.0);
            }
          `,
			);
		};
	}
}

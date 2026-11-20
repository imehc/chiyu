/**
 * 渐变着色器：按顶点在某个轴向上的位置，对两种颜色做插值并乘到最终光照结果上，
 * 常用于给柱体、地图块做「底深顶亮」的纵向渐变。
 * 与 diffuse-shader 一样通过 onBeforeCompile 注入，不替换材质。
 */
import { Color, type Material, type WebGLProgramParametersWithUniforms } from "three";

/** 构造选项：dir 限定为三个轴向，其余字段沿用 defaultOption 的类型 */
type GradientShaderOption = Omit<typeof defaultOption, 'dir'> & {
  dir: "x" | "y" | "z"
}

/**
 * 默认参数。
 * 默认配色为青绿 → 深墨绿；size 15 与柱体高度同量级，便于把坐标归一化到 0~1。
 */
const defaultOption = {
  uColor1: 0x2a6f72,
  uColor2: 0x0d2025,
  size: 15.0,
  dir: "x", // 'x' | 'y' | 'z'
}

/**
 * 渐变着色器注入器。
 * 构造时即完成注入，实例本身只用于回读编译后的 shader。
 */
export default class GradientShader {
  #option: GradientShaderOption
  /** 编译后的 shader，onBeforeCompile 触发前为 null */
  #shader: WebGLProgramParametersWithUniforms | null
  /**
   * @param material 目标材质
   * @param option 颜色、渐变方向与尺寸，未传项取默认值
   */
  constructor(material: Material, option: Partial<GradientShaderOption>) {
    this.#option = Object.assign({}, defaultOption, option)
    this.#shader = null
    this.init(material)
  }

  /** 取编译后的 shader 参数，用于读取或改写 uniform */
  get shader() {
    return this.#shader
  }

  /**
   * 注入 uniform 与 GLSL。
   * onBeforeCompile 在材质首次参与渲染时触发，之后改材质参数不会重新注入。
   */
  init(material: Material) {
    const { uColor1, uColor2, dir, size } = this.#option
    // 轴向转成着色器里的数字标识；注意 2.0 在片元中取 z 坐标、3.0 取 y 坐标，
    // 与字面含义正好相反，设置 dir 时以片元分支为准
    const dirMap = { x: 1.0, y: 2.0, z: 3.0 }
    material.onBeforeCompile = (shader) => {
      this.#shader = shader

      // 保留 Three.js 自带 uniform 再追加自定义项；
      // uSize 需与实际物体尺寸匹配，否则坐标/尺寸会越界，渐变提前饱和成纯色
      shader.uniforms = {
        ...shader.uniforms,
        uColor1: { value: new Color(uColor1) }, // 419daa
        uColor2: { value: new Color(uColor2) },
        uDir: { value: dirMap[dir] },
        uSize: { value: size }, // 物体的宽度，或者高度
      }
      // 顶点着色器：额外声明 alpha 属性并透传位置，片元里用位置算渐变因子
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        `
                attribute float alpha;
                varying vec3 vPosition;
                varying float vAlpha;
                void main() {
                  vAlpha = alpha;
                  vPosition = position;
              `
      )
      // 片元着色器：声明 uniform 与同名 varying，
      // uniform 在 JS 侧赋值，varying 由顶点阶段插值而来
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        `
                varying vec3 vPosition;
                varying float vAlpha;
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform float uDir;
                uniform float uSize;
              
                void main() {
              `
      )
      // 在 opaque_fragment 处替换输出：此时 outgoingLight 已完成光照计算，
      // 乘上渐变色即可保留原有明暗关系，只改变色相
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        /* glsl */ `
              #ifdef OPAQUE
              diffuseColor.a = 1.0;
              #endif
              
              // https://github.com/mrdoob/three.js/pull/22425
              #ifdef USE_TRANSMISSION
              diffuseColor.a *= transmissionAlpha + 0.1;
              #endif
              // vec3 gradient = mix(uColor1, uColor2, vPosition.x / 15.0); 
              vec3 gradient = vec3(0.0,0.0,0.0);
              if(uDir==1.0){
                gradient = mix(uColor1, uColor2, vPosition.x/ uSize); 
              }else if(uDir==2.0){
                gradient = mix(uColor1, uColor2, vPosition.z/ uSize); 
              }else if(uDir==3.0){
                gradient = mix(uColor1, uColor2, vPosition.y/ uSize); 
              }
              outgoingLight = outgoingLight * gradient;
              
              
              gl_FragColor = vec4( outgoingLight, diffuseColor.a  );
              `
      )
    }
  }
}
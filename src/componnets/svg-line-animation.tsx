/**
 * SVG 流动光带：让一个带径向渐变的圆沿指定 path 循环运动，
 * 再用它作为 mask 只在圆覆盖处露出描边，从而形成「光点沿线路跑」的效果。
 * 被 header 的装饰线条与各屏面板的连线上使用。
 */
import { createUniqueId } from "solid-js";

interface SvgLineAnimationProps {
    /** viewBox 的逻辑宽度，不是屏幕像素（外层 svg 宽高恒为 100%） @default 135 */
    width?: number;
    /** viewBox 的逻辑高度 @default 150 */
    height?: number;
    /** 运动轨迹，坐标基于上述 viewBox，通常是一段横向折线 @default 'M0 72.5H682L732 0.5H3082' */
    path?: string;
    /** 描边颜色 @default '#0091FF' */
    color?: string;
    /** 光点走完整条 path 的耗时，单位秒；越小越快 @default 3 */
    duration?: number;
    /** 光点半径（viewBox 单位），越大光带越长 @default 100 */
    length?: number;
    /** 首次运动前的等待时间，单位秒，用于让多条线错开节奏 @default 0 */
    begin?: number;
    /** 同时用作 animateMotion 的 keyPoints 与径向渐变透明度，控制光带走动方向与头尾明暗 @default [0, 1] */
    dir?: [number, number];
    /** 描边线宽（viewBox 单位） @default 4 */
    strokeWidth?: number;
    /** 外层容器类名，定位与尺寸由调用方决定 */
    class?: string;
}

/**
 * 流动光带组件。
 * 每个实例生成独立的 mask / 渐变 id，否则同页多条线会共用第一个实例的渐变而失去各自颜色。
 */
export default function SvgLineAnimation({
    width = 135,
    height = 150,
    path = 'M0 72.5H682L732 0.5H3082',
    color = '#0091FF',
    duration = 3,
    length = 100,
    begin = 0,
    dir = [0, 1],
    strokeWidth = 4,
    class: className = ''
}: SvgLineAnimationProps) {
    // 每条光带独立的 mask 与渐变 id，避免同页多实例时遮罩串用
    const uid = createUniqueId()
    const maskId = `svgline-${uid}`
    const radialGradientId = `radial-gradient-${uid}`

    // 描边画的是完整轨迹，靠 mask 只露出光点覆盖的一小段；
    // 渐变 stop 的透明度取自 dir（0% 用 dir[1]、100% 用 dir[0]），默认朝运动方向渐隐成拖尾
    return (
        <div class={className}>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
                <title> </title>
                <defs>
                    <radialGradient id={radialGradientId} cx="50%" cy="50%" fx="100%" fy="50%" r="50%">
                        <stop offset="0%" stop-color="#fff" stop-opacity={dir[1]} />
                        <stop offset="100%" stop-color="#fff" stop-opacity={dir[0]} />
                    </radialGradient>
                    <mask id={maskId}>
                        <circle r={length} cx="0" cy="0" fill={`url(#${radialGradientId})`}>
                            <animateMotion
                                begin={`${begin}s`}
                                dur={`${duration}s`}
                                path={path}
                                rotate="auto"
                                keyPoints={`${dir[0]};${dir[1]}`}
                                keyTimes="0;1"
                                repeatCount="indefinite"
                            ></animateMotion>
                        </circle>
                    </mask>
                </defs>
                <path class="tw:mix-blend-screen" d={path} stroke={color} stroke-width={strokeWidth} mask={`url(#${maskId})`} />
            </svg>
        </div>
    )
}

import { createUniqueId } from "solid-js";

interface SvgLineAnimationProps {
    /** 宽度 @default 135 */
    width?: number;
    /** 高度 @default 150 */
    height?: number;
    /** 路径 @default 'M0 72.5H682L732 0.5H3082 */
    path?: string;
    /** 颜色 @default '#0091FF' */
    color?: string;
    /** 延迟 @default 3 */
    duration?: number;
    /** 线条长度 @default 100 */
    length?: number;
    /** 开始位置 @default 0 */
    begin?: number;
    /** 结束位置 @default [0, 1] */
    dir?: [number, number];
    /** 线条宽度 @default 4 */
    strokeWidth?: number;
    class?: string;
}

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
    const uid = createUniqueId()
    const maskId = `svgline-${uid}`
    const radialGradientId = `radial-gradient-${uid}`

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
                <path class="mix-blend-screen" d={path} stroke={color} stroke-width={strokeWidth} mask={`url(#${maskId})`} />
            </svg>
        </div>
    )
}

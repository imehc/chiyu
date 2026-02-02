import { type JSXElement } from "solid-js";
import SvgLineAnimation from "../componnets/svg-line-animation";
import './header.css'

interface HeaderProps {
    /** 标题 @default '数据可视化大屏' */
    title?: string;
    /** 副标题 @default 'Visualization Platform' */
    subText?: string;
    leftChindren?: JSXElement;
    rightChindren?: JSXElement;
}

export default function Header({ title = '数据可视化大屏', subText = 'Visualization Platform', leftChindren, rightChindren }: HeaderProps) {
    return (
        <div class="m-header">
            <div class="m-header-wrap">
                <div class="m-header-title">{title}</div>
                <div class="m-header-subtext">{subText}</div>
            </div>
            <div class="m-header-left" style="color: #fff">
                {leftChindren}
            </div>
            <div class="m-header-right">
                {rightChindren}
            </div>
            <div class="m-header-line">
                <SvgLineAnimation
                    class="m-header-line-left"
                    width={961}
                    height={79}
                    color="#30DCFF"
                    strokeWidth={2}
                    dir={[0, 1]}
                    length={100}
                    path="M1 1.52783L535 25.6808C552.73 26.5835 571.454 31.3851 588.834 39.2194C593.758 41.4385 598.692 43.7289 603.643 46.0273C633.567 59.9182 664.121 74.1016 696.754 74.6262C696.765 74.6264 696.775 74.6265 696.786 74.6267C821.602 76.5993 879.336 78 961 78"
                />
                <SvgLineAnimation
                    class="m-header-line-right"
                    width={961}
                    height={79}
                    color="#30DCFF"
                    strokeWidth={2}
                    dir={[0, 1]}
                    length={100}
                    path="M1 1.52783L535 25.6808C552.73 26.5835 571.454 31.3851 588.834 39.2194C593.758 41.4385 598.692 43.7289 603.643 46.0273C633.567 59.9182 664.121 74.1016 696.754 74.6262C696.765 74.6264 696.775 74.6265 696.786 74.6267C821.602 76.5993 879.336 78 961 78"
                />
                {/* <SvgLineAnimation
                    class="m-header-line-left-top"
                    width={329}
                    height={30}
                    color="#30DCFF"
                    strokeWidth={2}
                    dir={[0, 1]}
                    length={100}
                    path="M1 1C6.62978 9.69943 71.3073 17.9776 182.506 24.1546C217.445 26.0955 256.119 27.7812 297.588 29.1902C302.543 29.3585 307.347 27.4694 310.865 23.9759L328.042 6.91683"
                />
                <SvgLineAnimation
                    class="m-header-line-right-top"
                    width={329}
                    height={30}
                    color="#30DCFF"
                    strokeWidth={2}
                    dir={[0, 1]}
                    length={100}
                    path="M1 1C6.62978 9.69943 71.3073 17.9776 182.506 24.1546C217.445 26.0955 256.119 27.7812 297.588 29.1902C302.543 29.3585 307.347 27.4694 310.865 23.9759L328.042 6.91683"
                /> */}
            </div>
        </div>
    )
}
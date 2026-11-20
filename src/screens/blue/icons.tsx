/**
 * 内联 SVG 图标集：全部图形绘制在 24×24 网格内、统一 1.5px 描边，
 * 由地图控件、图层按钮与指标卡共用，不依赖图标字体或外部图片资源。
 */
import type { JSX } from "solid-js";

/**
 * 图标入参。
 */
type BlueIconProps = {
	/** 图形名称，取值见下方 switch 分支，未命中时回落到十字方框 */
	name: string;
	/** 图标边长（px），宽高同值，默认 14；按钮缩放时由调用方按比例传入 */
	size?: number;
};

/**
 * 按名称渲染一个图标。
 * 描边色取 currentColor，填充色也取 currentColor，因此父级改 color 即可整体换色；
 * fill-opacity 只用来区分「实体块」与「轮廓」两种质感，不影响外部配色。
 */
export default function BlueIcon(props: BlueIconProps) {
	/**
	 * 将 name 映射为一组 SVG 子元素。
	 * 写成函数而不是常量表，是为了每次调用都重新读取 props.name，保持响应式。
	 */
	const shape = (): JSX.Element => {
		switch (props.name) {
			case "scan":
				// 扫描：地球轮廓 + 一道横向扫描环 + 向下箭头，表示逐行扫过地图
				return (
					<>
						<circle cx="12" cy="12" r="9" />
						<ellipse
							cx="12"
							cy="12"
							rx="8.5"
							ry="2.8"
							fill="currentColor"
							fill-opacity=".2"
						/>
						<path d="M12 4v5m-2-2 2 2 2-2" />
					</>
				);
			case "graticule":
				// 经纬网：外圆 + 一条经线椭圆 + 赤道与两条纬线，代表球面网格
				return (
					<>
						<circle cx="12" cy="12" r="9" />
						<ellipse cx="12" cy="12" rx="4" ry="9" />
						<path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
					</>
				);
			case "coast":
				// 海岸线：左侧折线是参差不齐的陆地边界，右侧四段弧线是向外扩散的浪花
				return (
					<>
						<path d="m4 3 4 3-1 4 4 2-2 4 3 5" />
						<path d="M15 4c2-2 3-2 5 0M14 9c2-2 4-2 6 0M15 14c2-2 3-2 5 0M15 19c2-2 3-2 5 0" />
					</>
				);
			case "label":
				// 标注：带左下小尾巴的对话气泡，内部两条横线示意文字
				return (
					<>
						<path
							d="M3 4h18v13H9l-5 4v-4H3Z"
							fill="currentColor"
							fill-opacity=".24"
						/>
						<path d="M7 8h10M7 12h7" />
					</>
				);
			case "point":
				// 点标记：水滴形定位针（上圆下尖）+ 中心圆点
				return (
					<>
						<path
							d="M12 22S4 14 4 9a8 8 0 0 1 16 0c0 5-8 13-8 13Z"
							fill="currentColor"
							fill-opacity=".24"
						/>
						<circle cx="12" cy="9" r="3" />
					</>
				);
			case "flyline":
			case "plane":
				// 飞线：纸飞机造型，同一路径先做半透明填充再描边（一形两用），末尾两段短线表示尾迹
				return (
					<>
						<path
							d="m21 3-7 18-3.6-7.4L3 10Z"
							fill="currentColor"
							fill-opacity=".42"
						/>
						<path d="m21 3-7 18-3.6-7.4L3 10Zm0 0L10.4 13.6M6 17l-3 3M8 19l-2 2" />
					</>
				);
			case "scatter":
				// 散点：中心大点 + 四角小点，中间四条斜短线暗示分布扩散；
				// 中心实心点用 stroke="none" 去掉描边，避免小尺寸下糊成一团
				return (
					<>
						<circle
							cx="12"
							cy="12"
							r="4"
							fill="currentColor"
							fill-opacity=".28"
						/>
						<circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
						<circle cx="4" cy="6" r="1.5" fill="currentColor" />
						<circle cx="19" cy="5" r="1.5" fill="currentColor" />
						<circle cx="5" cy="19" r="1.5" fill="currentColor" />
						<circle cx="20" cy="18" r="1.5" fill="currentColor" />
						<path d="m7 8 2 2m6-1 2-2m-2 8 2 2m-9-1 2-2" opacity=".55" />
					</>
				);
			case "heat":
				// 热力：外层火焰轮廓（低透明度填充）+ 内层火心（高透明度填充），靠透明度叠出层次
				return (
					<>
						<path
							d="M12 3c2 4 0 5 2 7 1-1 2-2 2-4 3 3 5 6 4 10a8 8 0 0 1-16 0c0-4 4-7 5-10 1 3 0 4 1 5 2-2 3-4 2-8Z"
							fill="currentColor"
							fill-opacity=".27"
						/>
						<path
							d="M12 13c-3 3-4 4-3 6a3 3 0 0 0 6 0c0-2-2-3-3-6Z"
							fill="currentColor"
							fill-opacity=".6"
						/>
					</>
				);
			case "region":
				// 区域：折页地图（三联折面，用竖线分格），内部小斜线表示地貌
				return (
					<>
						<path
							d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"
							fill="currentColor"
							fill-opacity=".22"
						/>
						<path d="m5 9 2-1m10 7 2-1M11 8l2 1" opacity=".65" />
					</>
				);
			case "back":
				// 返回：向左箭头 + 回环弧线，对应「上一级 / 退出下钻」
				return <path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12h-2" />;
			case "factory":
				// 工厂：锯齿形厂房剖面 + 右侧烟囱，两条虚线表示窗格
				return (
					<>
						<path
							d="M3 21V9l6-4v6l6-4v5h6v9ZM17 12V3h3v9"
							fill="currentColor"
							fill-opacity=".3"
						/>
						<path d="M6 16h2m4 0h2m4 0h1M6 19h2m4 0h2m4 0h1" />
					</>
				);
			case "truck":
				// 卡车：车厢 + 车头轮廓，两个车轮用 #06324a 实心填充以遮住车身底色，
				// 这里的深色是车轮专用值，不随 currentColor 变化
				return (
					<>
						<path
							d="M2 5h12v12H2ZM14 9h4l4 4v4h-8Z"
							fill="currentColor"
							fill-opacity=".3"
						/>
						<path d="M17 10v3h4" />
						<circle cx="6" cy="18" r="2.5" fill="#06324a" />
						<circle cx="18" cy="18" r="2.5" fill="#06324a" />
					</>
				);
			case "building":
				// 楼宇：高低两栋体块先铺半透明底，再用线条勾窗格与地面线
				return (
					<>
						<path d="M3 21h18M5 21V7h6v14m0-17h8v17M7 10h2m-2 4h2m-2 4h2m4-11h4m-4 4h4m-4 4h4" />
						<path
							d="M5 7h6v14H5Zm6-3h8v17h-8Z"
							fill="currentColor"
							fill-opacity=".22"
						/>
					</>
				);
			case "ship":
				// 船舶：船体 + 上层驾驶舱 + 桅杆，底部波浪用四段连续弧表现水面
				return (
					<>
						<path
							d="m3 13 9-3 9 3-4 6H7ZM7 11V6h10v5M10 6V3h4v3"
							fill="currentColor"
							fill-opacity=".3"
						/>
						<path d="M12 10v7M2 21c2-2 3-2 5 0 2-2 3-2 5 0 2-2 3-2 5 0 2-2 3-2 5 0" />
					</>
				);
			case "tools":
				// 工具：斜置扳手 + 螺丝刀，右上缺口用弧线切出扳手开口
				return (
					<>
						<path
							d="m14 5 3 3 4-4a6 6 0 0 1-7 8l-9 9-3-3 9-9a6 6 0 0 1 8-7Z"
							fill="currentColor"
							fill-opacity=".28"
						/>
						<path d="m4 4 4 4M3 3l3-1 3 3-1 3-3 1-3-3Zm10 11 6 6 2-2-6-6" />
					</>
				);
			default:
				// 兜底图形：方框加十字分割线，名称拼错时仍能看出是占位图标
				return <path d="M4 4h16v16H4ZM4 12h16M12 4v16" />;
		}
	};
	// 外层 svg 统一承担尺寸与描边样式：size 未传时按 14px 渲染；
	// inline-block + vertical-align:middle 让图标与文字基线对齐，flex-shrink:0 防止在 flex 行内被压扁
	return (
		<svg
			viewBox="0 0 24 24"
			width={props.size ?? 14}
			height={props.size ?? 14}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			style={{
				display: "inline-block",
				"vertical-align": "middle",
				"flex-shrink": 0,
			}}
		>
			{shape()}
		</svg>
	);
}

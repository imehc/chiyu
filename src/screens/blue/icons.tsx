import type { JSX } from "solid-js";

type BlueIconProps = {
	name: string;
	size?: number;
};

/** Small, code-native pictograms shared by the map controls and metric cards. */
export default function BlueIcon(props: BlueIconProps) {
	const shape = (): JSX.Element => {
		switch (props.name) {
			case "scan":
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
				return (
					<>
						<circle cx="12" cy="12" r="9" />
						<ellipse cx="12" cy="12" rx="4" ry="9" />
						<path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
					</>
				);
			case "coast":
				return (
					<>
						<path d="m4 3 4 3-1 4 4 2-2 4 3 5" />
						<path d="M15 4c2-2 3-2 5 0M14 9c2-2 4-2 6 0M15 14c2-2 3-2 5 0M15 19c2-2 3-2 5 0" />
					</>
				);
			case "label":
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
				return <path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12h-2" />;
			case "factory":
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
				return <path d="M4 4h16v16H4ZM4 12h16M12 4v16" />;
		}
	};
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

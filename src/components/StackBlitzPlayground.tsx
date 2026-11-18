import sdk, { type ProjectTemplate } from "@stackblitz/sdk";
import styles from "./StackBlitzPlayground.module.css";

export interface StackBlitzPlaygroundProps {
	files: Record<string, string>;
	title?: string;
	description?: string;
	template?: ProjectTemplate;
	openFile?: string | string[];
	dependencies?: Record<string, string>;
}

export default function StackBlitzPlayground({
	files,
	title = "代码示例",
	description = "在 StackBlitz 中在线运行和修改",
	template = "node",
	openFile,
	dependencies,
}: StackBlitzPlaygroundProps) {
	const handleOpen = () => {
		sdk.openProject(
			{
				title,
				description,
				template,
				files,
				...(dependencies && { dependencies }),
			},
			{ openFile },
		);
	};

	return (
		<div className={styles.playground}>
			<div className={styles.intro}>
				<div className={styles.icon}>
					<svg
						width={20}
						height={20}
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M13.7 2 5 13.2h5.3L9.4 22 19 10.2h-5.6L13.7 2Z" />
					</svg>
				</div>
				<div className={styles.text}>
					<div className={styles.title}>{title}</div>
					<p className={styles.description}>{description}</p>
				</div>
			</div>
			<button
				type="button"
				onClick={handleOpen}
				className={`button button--primary ${styles.openButton}`}
			>
				在 StackBlitz 中打开
				<svg
					width={16}
					height={16}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M7 17 17 7M9 7h8v8" />
				</svg>
			</button>
		</div>
	);
}

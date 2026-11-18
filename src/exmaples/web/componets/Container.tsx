import ErrorBoundary from "@docusaurus/ErrorBoundary";
import clsx from "clsx";
import {
	forwardRef,
	type PropsWithChildren,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import styles from "./Container.module.css";

export interface ContainerProps {
	className?: string;
	hiddenBorder?: boolean;
	autoHeight?: boolean;
	fullWidth?: boolean;
	controls?: ReactNode;
	allowFullscreen?: boolean;
}

export default forwardRef<HTMLDivElement, PropsWithChildren<ContainerProps>>(
	(
		{
			children,
			className,
			hiddenBorder = false,
			autoHeight = false,
			fullWidth = false,
			controls,
			allowFullscreen = true,
		},
		ref,
	) => {
		const hasControls = controls != null;
		const root = useRef<HTMLDivElement>(null);
		const [fullscreen, setFullscreen] = useState(false);
		const [fullscreenSupported, setFullscreenSupported] = useState(false);
		const [fullscreenError, setFullscreenError] = useState(false);
		useEffect(() => {
			const element = root.current;
			setFullscreenSupported(
				Boolean(document.fullscreenEnabled && element?.requestFullscreen),
			);
			const onChange = () =>
				setFullscreen(document.fullscreenElement === element);
			document.addEventListener("fullscreenchange", onChange);
			return () => {
				document.removeEventListener("fullscreenchange", onChange);
				if (document.fullscreenElement === element)
					void document.exitFullscreen().catch(() => {});
			};
		}, []);
		useEffect(() => {
			const viewport = root.current?.querySelector("[data-example-viewport]");
			if (!viewport) return;
			let frame = 0;
			const observer = new ResizeObserver(() => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(() =>
					window.dispatchEvent(new Event("resize")),
				);
			});
			observer.observe(viewport);
			return () => {
				observer.disconnect();
				cancelAnimationFrame(frame);
			};
		}, []);

		async function toggleFullscreen() {
			setFullscreenError(false);
			try {
				if (document.fullscreenElement === root.current)
					await document.exitFullscreen();
				else await root.current?.requestFullscreen();
			} catch {
				if (root.current) setFullscreenError(true);
			}
		}

		return (
			<div
				ref={root}
				data-example-root
				className={clsx(
					styles.example,
					fullWidth || fullscreen ? "tw:w-full" : "tw:w-full tw:md:w-2xl",
				)}
			>
				<div
					ref={ref}
					data-example-viewport
					className={clsx(
						styles.viewport,
						"tw:w-full tw:relative",
						{
							"tw:border tw:border-base-300 tw:box-border":
								!hiddenBorder && !fullscreen,
						},
						{
							"tw:aspect-video tw:overflow-hidden": !autoHeight && !fullscreen,
						},
						className,
					)}
				>
					<ErrorBoundary
						fallback={({ error, tryAgain }) => (
							<div className="tw:h-full tw:flex tw:flex-col tw:justify-center tw:items-center">
								<div>Something went wrong</div>
								<div className="tw:text-error">{error.message}</div>
								<button
									type="button"
									className="tw:btn tw:btn-sm tw:btn-primary"
									onClick={() => tryAgain()}
								>
									Reload
								</button>
							</div>
						)}
					>
						{children}
					</ErrorBoundary>
				</div>
				<div data-example-controls className={styles.controls}>
					{hasControls && (
						<details className={styles.panel}>
							<summary aria-label="操作面板" title="操作面板">
								操作面板
							</summary>
							{controls}
						</details>
					)}
					<div className={styles.actions}>
						{allowFullscreen && fullscreenSupported && (
							<button
								type="button"
								className={styles.actionButton}
								aria-pressed={fullscreen}
								aria-label={fullscreen ? "退出全屏" : "全屏"}
								title={fullscreen ? "退出全屏" : "全屏"}
								onClick={() => void toggleFullscreen()}
							>
								{fullscreen ? (
									<svg
										width={20}
										height={20}
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth={1.75}
										strokeLinecap="round"
										strokeLinejoin="round"
										aria-hidden="true"
									>
										<path d="M4 9h5V4m6 0v5h5M20 15h-5v5m-6 0v-5H4" />
									</svg>
								) : (
									"全屏"
								)}
							</button>
						)}
						<div data-example-source-actions />
					</div>
					{fullscreenError && (
						<p className={styles.fullscreenError} role="alert">
							无法切换全屏，请重试。
						</p>
					)}
				</div>
				<div data-example-overlays />
			</div>
		);
	},
);

import ErrorBoundary from "@docusaurus/ErrorBoundary";
import clsx from "clsx";
import { forwardRef, type PropsWithChildren, type ReactNode } from "react";
import styles from "./Container.module.css";

export interface ContainerProps {
	className?: string;
	hiddenBorder?: boolean;
	autoHeight?: boolean;
	fullWidth?: boolean;
	controls?: ReactNode;
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
		},
		ref,
	) => {
		const hasControls = controls != null;

		return (
			<div
				data-example-root
				className={clsx(
					styles.example,
					fullWidth ? "tw:w-full" : "tw:w-full tw:md:w-2xl",
				)}
			>
				<div
					ref={ref}
					data-example-viewport
					className={clsx(
						"tw:w-full tw:relative",
						{ "tw:border tw:border-base-300 tw:box-border": !hiddenBorder },
						{ "tw:aspect-video tw:overflow-hidden": !autoHeight },
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
							<summary>操作面板</summary>
							{controls}
						</details>
					)}
				</div>
			</div>
		);
	},
);

import CodeBlock from "@theme/CodeBlock";
import IconClose from "@theme/Icon/Close";
import TabItem from "@theme/TabItem";
import Tabs from "@theme/Tabs";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ExampleSource.module.css";

interface ExampleSourceProps {
	loadFiles: () => Promise<Record<string, string>>;
}

function language(filename: string) {
	const extension = filename.split(".").at(-1);
	if (extension === "mjs" || extension === "cjs") return "js";
	return extension ?? "text";
}

function fileLabel(filename: string, filenames: string[]) {
	const parts = filename.split("/");
	for (let depth = 1; depth <= parts.length; depth++) {
		const label = parts.slice(-depth).join("/");
		if (
			!filenames.some(
				(other) =>
					other !== filename &&
					other.split("/").slice(-depth).join("/") === label,
			)
		)
			return label;
	}
	return filename;
}

export default function ExampleSource({ loadFiles }: ExampleSourceProps) {
	const [open, setOpen] = useState(false);
	const [files, setFiles] = useState<Record<string, string> | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const [actionHost, setActionHost] = useState<HTMLElement | null>(null);
	const source = useRef<HTMLDivElement>(null);
	const mounted = useRef(true);
	const pending = useRef(false);
	const dialog = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		const marker = source.current;
		const parent = marker?.parentElement;
		if (!marker || !parent) return;
		const findActionHost = () => {
			const previous = marker.previousElementSibling;
			const root = previous?.matches("[data-example-root]")
				? previous
				: previous?.querySelector("[data-example-root]");
			setActionHost(
				root?.querySelector<HTMLElement>(
					":scope > [data-example-controls] > [data-example-source-actions]",
				) ?? null,
			);
		};
		findActionHost();
		const observer = new MutationObserver(findActionHost);
		observer.observe(parent, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (!open) return;
		const root = document.documentElement;
		const overflow = root.style.overflow;
		root.style.overflow = "hidden";
		return () => {
			root.style.overflow = overflow;
		};
	}, [open]);

	async function loadSource() {
		if (pending.current) return;
		pending.current = true;
		setLoading(true);
		setError(false);
		try {
			const result = await loadFiles();
			if (mounted.current) setFiles(result);
		} catch {
			if (mounted.current) setError(true);
		} finally {
			pending.current = false;
			if (mounted.current) setLoading(false);
		}
	}

	const entries = Object.entries(files ?? {});
	const filenames = entries.map(([name]) => name);
	const trigger = (
		<button
			type="button"
			className={`${styles.trigger} ${actionHost ? styles.inlineTrigger : ""}`}
			aria-haspopup="dialog"
			onClick={() => {
				dialog.current?.showModal();
				setOpen(true);
				if (!files) void loadSource();
			}}
		>
			查看源码
		</button>
	);
	return (
		<div
			ref={source}
			className={
				actionHost ? undefined : `tw:w-full tw:md:w-2xl ${styles.source}`
			}
		>
			{actionHost ? createPortal(trigger, actionHost) : trigger}
			<dialog
				ref={dialog}
				className={styles.dialog}
				aria-labelledby={titleId}
				onClose={() => setOpen(false)}
			>
				<header className={styles.header}>
					<h2 id={titleId}>示例源码</h2>
					<button
						type="button"
						className={styles.closeButton}
						aria-label="关闭源码弹窗"
						title="关闭"
						onClick={() => dialog.current?.close()}
					>
						<IconClose width={20} height={20} />
					</button>
				</header>
				<div className={styles.content}>
					{loading && <p role="status">加载源码…</p>}
					{error && (
						<p role="alert">
							源码加载失败。
							<button
								type="button"
								className="button button--secondary button--sm"
								onClick={() => void loadSource()}
							>
								重试
							</button>
						</p>
					)}
					{entries.length === 1 && (
						<div className={styles.singleFile}>
							<CodeBlock
								language={language(entries[0][0])}
								title={entries[0][0]}
								showLineNumbers
							>
								{entries[0][1]}
							</CodeBlock>
						</div>
					)}
					{entries.length > 1 && (
						<Tabs lazy className={styles.fileTabs}>
							{entries.map(([name, code]) => (
								<TabItem
									key={name}
									value={name}
									label={fileLabel(name, filenames)}
									attributes={{ title: name }}
								>
									<CodeBlock
										language={language(name)}
										title={name}
										showLineNumbers
									>
										{code}
									</CodeBlock>
								</TabItem>
							))}
						</Tabs>
					)}
				</div>
			</dialog>
		</div>
	);
}

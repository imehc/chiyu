import CodeBlock from "@theme/CodeBlock";
import IconClose from "@theme/Icon/Close";
import TabItem from "@theme/TabItem";
import Tabs from "@theme/Tabs";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExampleSourceBundle } from "../../../data/example-source";
import styles from "./ExampleSource.module.css";

interface ExampleSourceProps {
	loadFiles: () => Promise<ExampleSourceBundle>;
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
	const [githubUrl, setGithubUrl] = useState<string | null>(null);
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
					":scope > [data-example-controls] [data-example-source-actions]",
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
			if (mounted.current) {
				setFiles(result.files);
				setGithubUrl(result.githubUrl);
			}
		} catch {
			if (mounted.current) setError(true);
		} finally {
			pending.current = false;
			if (mounted.current) setLoading(false);
		}
	}

	const entries = Object.entries(files ?? {});
	const filenames = entries.map(([name]) => name);
	const overlayHost = actionHost
		?.closest("[data-example-root]")
		?.querySelector<HTMLElement>(":scope > [data-example-overlays]");
	const trigger = (
		<button
			type="button"
			className={`${styles.trigger} ${actionHost ? styles.inlineTrigger : ""}`}
			aria-haspopup="dialog"
			aria-label="查看源码"
			title="查看源码"
			onClick={() => {
				dialog.current?.showModal();
				setOpen(true);
				if (!files) void loadSource();
			}}
		>
			<svg
				className={styles.sourceIcon}
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
				<path d="m8 7-5 5 5 5m8-10 5 5-5 5M13 3l-2 18" />
			</svg>
			<span className={styles.sourceLabel}>查看源码</span>
		</button>
	);
	const modal = (
		<dialog
			ref={dialog}
			className={styles.dialog}
			aria-labelledby={titleId}
			onClose={() => setOpen(false)}
		>
			<header className={styles.header}>
				<h2 id={titleId}>示例源码</h2>
				<div className={styles.headerActions}>
					{githubUrl && (
						<a
							className={styles.githubLink}
							href={githubUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="在 GitHub 中查看示例源码"
						>
							GitHub
							<svg
								width={16}
								height={16}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.75}
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />
							</svg>
						</a>
					)}
					<button
						type="button"
						className={styles.closeButton}
						aria-label="关闭源码弹窗"
						title="关闭"
						onClick={() => dialog.current?.close()}
					>
						<IconClose width={20} height={20} />
					</button>
				</div>
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
	);
	return (
		<div
			ref={source}
			className={
				actionHost ? undefined : `tw:w-full tw:md:w-2xl ${styles.source}`
			}
		>
			{actionHost ? createPortal(trigger, actionHost) : trigger}
			{overlayHost ? createPortal(modal, overlayHost) : modal}
		</div>
	);
}

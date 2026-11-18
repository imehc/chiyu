import useBaseUrl from "@docusaurus/useBaseUrl";
import StackBlitzPlayground from "@site/src/components/StackBlitzPlayground";
import { useEffect, useState } from "react";
import Container from "../../../componets/Container";

export default function DashboardScreen() {
	const url = useBaseUrl("/previews/dashboard-screen/index.html");
	const projectUrl = useBaseUrl("/previews/dashboard-screen/project.json");
	const [files, setFiles] = useState<Record<string, string> | null>(null);
	const [sourceError, setSourceError] = useState(false);
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		const controller = new AbortController();
		setSourceError(false);
		fetch(`${projectUrl}?retry=${retry}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error("Project source unavailable");
				return response.json() as Promise<{ files: Record<string, string> }>;
			})
			.then((project) => {
				if (!controller.signal.aborted) setFiles(project.files);
			})
			.catch(() => {
				if (!controller.signal.aborted) setSourceError(true);
			});
		return () => controller.abort();
	}, [projectUrl, retry]);
	return (
		<>
			<Container hiddenBorder fullWidth>
				<iframe
					src={url}
					title="可视化大屏"
					className="tw:absolute tw:inset-0 tw:w-full tw:h-full tw:border-0"
					loading="lazy"
					allow="fullscreen"
				/>
			</Container>
			{files && (
				<StackBlitzPlayground
					files={files}
					title="可视化大屏源码"
					description="完整项目可在 StackBlitz 中查看、编辑和运行"
					openFile="src/App.tsx"
				/>
			)}
			{!files && !sourceError && <p role="status">准备项目源码…</p>}
			{sourceError && (
				<p role="alert">
					项目源码加载失败。
					<button
						type="button"
						className="button button--secondary button--sm"
						onClick={() => setRetry((value) => value + 1)}
					>
						重试
					</button>
				</p>
			)}
		</>
	);
}

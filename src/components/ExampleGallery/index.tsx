import Link from "@docusaurus/Link";
import { usePluginData } from "@docusaurus/useGlobalData";
import { useId, useState } from "react";
import type { ExampleGalleryData } from "../../data/examples";
import styles from "./styles.module.css";

export default function ExampleGallery() {
	const { examples } = usePluginData("example-gallery") as ExampleGalleryData;
	const [technology, setTechnology] = useState("");
	const [level, setLevel] = useState("");
	const [query, setQuery] = useState("");
	const id = useId();
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const availableLevels = [
		...new Set(
			examples
				.filter((example) => !technology || example.technology === technology)
				.map((example) => example.level),
		),
	];
	const filtered = examples.filter(
		(example) =>
			(!technology || example.technology === technology) &&
			(!level || example.level === level) &&
			`${example.title} ${example.description} ${example.technology} ${example.level}`
				.toLocaleLowerCase()
				.includes(normalizedQuery),
	);
	function reset() {
		setTechnology("");
		setLevel("");
		setQuery("");
	}
	return (
		<section aria-label="示例画廊">
			<div className={styles.filters}>
				<label className={styles.search} htmlFor={`${id}-query`}>
					搜索示例
					<input
						id={`${id}-query`}
						type="search"
						value={query}
						placeholder="输入示例名称或关键词"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				<label htmlFor={`${id}-technology`}>
					技术
					<select
						id={`${id}-technology`}
						value={technology}
						onChange={(event) => {
							setTechnology(event.target.value);
							setLevel("");
						}}
					>
						<option value="">全部技术</option>
						{[...new Set(examples.map((example) => example.technology))].map(
							(item) => (
								<option key={item} value={item}>
									{item}
								</option>
							),
						)}
					</select>
				</label>
				<label htmlFor={`${id}-level`}>
					层级
					<select
						id={`${id}-level`}
						value={level}
						onChange={(event) => setLevel(event.target.value)}
					>
						<option value="">全部层级</option>
						{availableLevels.map((item) => (
							<option key={item} value={item}>
								{item}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className={styles.results}>
				<p role="status">
					显示 {filtered.length} / {examples.length} 个示例
				</p>
				{(query || technology || level) && (
					<button
						type="button"
						className="button button--secondary button--outline button--sm"
						onClick={reset}
					>
						清除筛选
					</button>
				)}
			</div>
			{filtered.length ? (
				<div className={styles.grid}>
					{filtered.map((example) => (
						<Link key={example.id} to={example.href} className={styles.card}>
							<div className={styles.meta}>
								<span>{example.technology}</span>
								<span>{example.level}</span>
							</div>
							<h2 className={styles.title}>{example.title}</h2>
							<p className={styles.description}>{example.description}</p>
							<span className={styles.action}>
								查看示例 <span aria-hidden="true">→</span>
							</span>
						</Link>
					))}
				</div>
			) : (
				<p className={styles.empty}>
					没有符合条件的示例，可以调整关键词或清除筛选。
				</p>
			)}
		</section>
	);
}

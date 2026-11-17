import Link from "@docusaurus/Link";
import {
	type KnowledgeDomainId,
	knowledgeDomains,
} from "@site/src/data/knowledge";
import styles from "./styles.module.css";

export function KnowledgeOverview() {
	return (
		<div className={styles.grid}>
			{knowledgeDomains.map((domain) => (
				<Link
					key={domain.id}
					to={`/knowledge/${domain.id}`}
					className={styles.card}
				>
					<h2 className={styles.title}>{domain.title}</h2>
					<p className={styles.description}>{domain.description}</p>
					<span className={styles.action}>
						浏览{domain.title}
						<span aria-hidden="true"> →</span>
					</span>
				</Link>
			))}
		</div>
	);
}

export function KnowledgeTopics({
	domain: domainId,
}: {
	domain: KnowledgeDomainId;
}) {
	const domain = knowledgeDomains.find((item) => item.id === domainId);
	if (!domain) return null;

	return domain.groups.map((group) => (
		<section key={group.title} className={styles.topic}>
			<h2>{group.title}</h2>
			<p>{group.description}</p>
			<ul>
				{group.articles.map((article) => (
					<li key={article.href}>
						<Link to={article.href}>{article.title}</Link>
					</li>
				))}
			</ul>
		</section>
	));
}

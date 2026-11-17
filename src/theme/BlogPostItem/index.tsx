import { useBlogPost } from "@docusaurus/plugin-content-blog/client";
import type { Props } from "@theme/BlogPostItem";
import OriginalBlogPostItem from "@theme-original/BlogPostItem";
import clsx from "clsx";
import styles from "./styles.module.css";

export default function BlogPostItem({ children, className }: Props) {
	const { metadata, isBlogPostPage } = useBlogPost();
	return (
		<OriginalBlogPostItem
			className={clsx(className, !isBlogPostPage && styles.listItem)}
		>
			{!isBlogPostPage && metadata.description ? (
				<p>{metadata.description}</p>
			) : (
				children
			)}
		</OriginalBlogPostItem>
	);
}

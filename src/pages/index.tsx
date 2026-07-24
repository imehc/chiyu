import Head from "@docusaurus/Head";
import { Redirect } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home() {
	const blogUrl = useBaseUrl("/blog");
	return (
		<>
			<Head>
				<meta httpEquiv="refresh" content={`0; url=${blogUrl}`} />
			</Head>
			<Redirect to={blogUrl} />
		</>
	);
}

import Head from "@docusaurus/Head";
import { Redirect } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home() {
	const knowledgeUrl = useBaseUrl("/intro");
	return (
		<>
			<Head>
				<meta httpEquiv="refresh" content={`0; url=${knowledgeUrl}`} />
			</Head>
			<Redirect to={knowledgeUrl} />
		</>
	);
}

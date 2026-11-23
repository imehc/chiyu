import ContainerWrapper from "@site/src/exmaples/web/componets/ContainerWrapper";
import { useContainerSize } from "@site/src/exmaples/web/hooks/useContainerSize";
import { asset } from "@site/src/utils/asset";
import { use, useEffect, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { countriesPromise } from "./countries";

/** 多边形 - 使用 react-globe.gl 独立渲染 */
export default function HexPolygonComponent() {
	const containerRef = useRef<HTMLDivElement>(null);
	const globeEl = useRef<GlobeMethods | undefined>(undefined);
	const countries = use(countriesPromise);
	const [width, height] = useContainerSize(containerRef);

	// 自动旋转
	useEffect(() => {
		const { current } = globeEl;
		if (!current || !width || !height) return;

		// const controls = current.controls();
		// controls.autoRotate = true;
		// controls.autoRotateSpeed = 0.35;

		// return () => {
		// 	controls.autoRotate = false;
		// 	current?.pauseAnimation();
		// };
	}, [width, height]);

	return (
		<ContainerWrapper ref={containerRef}>
			{({ width, height }) => (
				<Globe
					ref={globeEl}
					width={width}
					height={height}
					globeImageUrl={asset("/three-globe/example/img/earth-dark.png")}
					hexPolygonsData={countries.features}
					hexPolygonResolution={3}
					hexPolygonMargin={0.3}
					hexPolygonUseDots={true}
					hexPolygonColor={() =>
						`#${Math.round(Math.random() * 2 ** 24)
							.toString(16)
							.padStart(6, "0")}`
					}
					hexPolygonLabel={(feature) => {
						const { properties: d } = feature as {
							properties: { ADMIN: string; ISO_A2: string; POP_EST: number };
						};
						return `
						<b>${d.ADMIN} (${d.ISO_A2})</b> <br />
						Population: <i>${d.POP_EST}</i>
					`;
					}}
				/>
			)}
		</ContainerWrapper>
	);
}

import { Stats } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import styles from "./Container.module.css";

export default function ExampleStats({
	showPanel = 0,
}: {
	showPanel?: number;
}) {
	const canvas = useThree((state) => state.gl.domElement);
	const parent = useMemo(
		() => ({ current: canvas.parentElement ?? canvas }),
		[canvas],
	);
	return (
		<Stats parent={parent} className={styles.stats} showPanel={showPanel} />
	);
}

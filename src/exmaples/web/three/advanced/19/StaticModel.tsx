import { useGLTF } from "@react-three/drei";

/**
 * 静态模型加载组件
 *
 * 核心功能：
 * - 使用 useGLTF Hook 加载 GLTF/GLB 格式的 3D 模型
 * - 交由外层 Suspense 处理加载状态
 */
export const StaticModel = () => {
	// useGLTF: 加载 GLTF 格式的 3D 模型文件
	// 返回模型的场景对象
	const { scene } = useGLTF("/models/monkey.glb");

	// primitive: 使用 Three.js 原生对象渲染加载的模型场景。
	return <primitive object={scene} />;
};

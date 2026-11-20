/**
 * Three.js 资源清理工具函数
 * 提供材质、几何体、纹理的递归销毁功能。
 * Three.js 的对象被移出场景后，几何体与纹理仍留在显存里，必须显式 dispose；
 * 大屏切换或重播时会调用这里，被 charts/pie.tsx 等 3D 场景代码使用。
 */

import { BufferGeometry, type Material, type Object3D, Texture } from "three";

/**
 * 材质销毁函数
 * 递归处理材质数组或单个材质，销毁其贴图和自身。
 * 贴图要单独 dispose：材质的 dispose 只释放程序与 uniform，不会连带释放纹理占用的显存。
 * 若同一张纹理被多个材质共享，重复 dispose 会让仍在使用的材质丢图，调用方需自行避免共享。
 * @param material - 单个材质或材质数组
 */
const materialDispose = (material: Material | Material[]): void => {
	if (Array.isArray(material)) {
		material.forEach(materialDispose);
	} else {
		// 检查并销毁材质的贴图（MeshBasicMaterial 等才有 map 字段，所以先做 in 判断）
		if ("map" in material && material.map instanceof Texture) {
			material.map.dispose();
		}
		material.dispose();
	}
};

/**
 * 对象资源释放函数
 * 递归销毁 Object3D 及其子对象的几何体、材质、纹理资源。
 * 用 `"geometry" in obj` 而不是 instanceof Mesh 判断，是为了同时覆盖 Points、Line、Sprite 等子类。
 * 只做释放，不从父级移除——移除动作由 emptyObject 负责。
 * @param obj - Three.js 对象
 */
const deallocate = (obj: Object3D): void => {
	// 销毁几何体
	if ("geometry" in obj && obj.geometry instanceof BufferGeometry) {
		obj.geometry.dispose();
	}

	// 销毁材质
	if ("material" in obj && obj.material !== undefined) {
		const mat = obj.material as Material | Material[];
		materialDispose(mat);
	}

	// 销毁纹理
	if ("texture" in obj && obj.texture instanceof Texture) {
		obj.texture.dispose();
	}

	// 递归处理子对象
	if (obj.children.length > 0) {
		obj.children.forEach(deallocate);
	}
};

/**
 * 清空对象所有子对象
 * 从父对象中移除所有子对象并释放其资源。
 * @param obj - 包含子对象的 Three.js 对象；传 null / undefined 时直接返回，方便在可选的 ref 上调用
 */
const emptyObject = (obj: Object3D | null | undefined): void => {
	if (obj === null || obj === undefined) {
		return;
	}

	// 始终取 children[0]：remove 会实时修改 children 数组，用正向 forEach 会漏掉元素
	while (obj.children.length > 0) {
		const childObj = obj.children[0];
		// 先 remove 再释放，保证 deallocate 期间该对象已不在场景树上
		obj.remove(childObj);
		deallocate(childObj);
	}
};

export { emptyObject, deallocate, materialDispose };

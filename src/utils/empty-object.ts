/**
 * Three.js 资源清理工具函数
 * 提供材质、几何体、纹理的递归销毁功能
 */

import { type Material, Texture, type Object3D, BufferGeometry } from 'three';

/**
 * 材质销毁函数
 * 递归处理材质数组或单个材质，销毁其贴图和自身
 * @param material - 单个材质或材质数组
 */
const materialDispose = (material: Material | Material[]): void => {
    if (material instanceof Array) {
        material.forEach(materialDispose);
    } else {
        // 检查并销毁材质的贴图
        if ('map' in material && material.map instanceof Texture) {
            material.map.dispose();
        }
        material.dispose();
    }
};

/**
 * 对象资源释放函数
 * 递归销毁 Object3D 及其子对象的几何体、材质、纹理资源
 * @param obj - Three.js 对象
 */
const deallocate = (obj: Object3D): void => {
    // 销毁几何体
    if ('geometry' in obj && obj.geometry instanceof BufferGeometry) {
        obj.geometry.dispose();
    }

    // 销毁材质
    if ('material' in obj && obj.material !== undefined) {
        const mat = obj.material as Material | Material[];
        materialDispose(mat);
    }

    // 销毁纹理
    if ('texture' in obj && obj.texture instanceof Texture) {
        obj.texture.dispose();
    }

    // 递归处理子对象
    if (obj.children.length > 0) {
        obj.children.forEach(deallocate);
    }
};

/**
 * 清空对象所有子对象
 * 从父对象中移除所有子对象并释放其资源
 * @param obj - 包含子对象的 Three.js 对象
 */
const emptyObject = (obj: Object3D | null | undefined): void => {
    if (obj === null || obj === undefined) {
        return;
    }

    while (obj.children.length > 0) {
        const childObj = obj.children[0];
        obj.remove(childObj);
        deallocate(childObj);
    }
};

export { emptyObject, deallocate, materialDispose };
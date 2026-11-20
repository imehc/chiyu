/**
 * 把 GeoJSON 文本解析并统一成 FeatureCollection，同时把 Polygon 包成 MultiPolygon。
 *
 * 上游地图组件（BaseMap / Line / ExtrudeMap）统一按 MultiPolygon 的三层坐标结构遍历，
 * 单环 Polygon 少一层嵌套会导致取点越界，因此这里先抹平差异。
 * 经纬度顺序保持 GeoJSON 规范 [经度, 纬度]，不做翻转；平面投影由各屏的 geoProjection 负责。
 */
import type { FeatureCollection } from 'geojson'

/**
 * @param data GeoJSON 原始文本（由 FileLoader 以纯字符串加载）
 * @returns 统一为 MultiPolygon 结构的 FeatureCollection
 */
export const transfromMapGeoJSON = (data: string) => {
    const worldData = JSON.parse(data)
    const features = worldData.features
    for (let i = 0; i < features.length; i++) {
        const element = features[i]
        // 仅处理单多边形：外面再套一层数组，即 coordinates = [coordinates]
        if (["Polygon"].includes(element.geometry.type)) {
            element.geometry.coordinates = [element.geometry.coordinates]
        }
    }
    return worldData as FeatureCollection
}
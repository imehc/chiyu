/**
 * 地图几何工具：Mercator 投影、环抽稀、Shape/Extrude 构建、顶面与侧壁 shader、
 * 屏幕空间淡出材质以及区域内部的低差异采样。
 * 被 china.ts、subdivisions.ts、region-transition 等共用；坐标系为世界坐标，
 * 地图平面是 xy（x 向东、y 向北为正），厚度方向为 +z。
 */
import { geoMercator } from "d3-geo";
import type { Position } from "geojson";
import {
	BufferGeometry,
	DoubleSide,
	type Group,
	LineBasicMaterial,
	LineLoop,
	type MeshBasicMaterial,
	ShaderMaterial,
	Shape,
	type Texture,
	Vector2,
	Vector3,
} from "three";
import type { MapFeature } from "./types";

/**
 * 把要素统一成「多边形数组」，每个多边形是若干闭合环（首环为外环，其余为孔洞）。
 * d3/GeoJSON 中 Polygon 与 MultiPolygon 的嵌套层数不同，这里做一次归一化，调用方无需分支判断。
 */
export const polygonsOf = (feature: MapFeature): Position[][][] =>
	feature.geometry.type === "Polygon"
		? [feature.geometry.coordinates]
		: feature.geometry.coordinates;

/**
 * 地图几何工厂。
 * 持有唯一的投影实例与共享 uniform，所有面片、描边都由它产出，保证整张地图坐标一致。
 */
export default class MapGeometry {
	/** Mercator 投影：以 [104.3, 35.7]（中国几何中心）为原点、缩放系数 14，translate 归零后投影结果即世界坐标 */
	readonly projection = geoMercator()
		.center([104.3, 35.7])
		.scale(14)
		.translate([0, 0]);
	/** 当前渲染视口尺寸（像素），由 resize 时写入，供上下文材质做屏幕空间淡出 */
	readonly contextViewport = new Vector2();
	/** 所有已创建的侧壁材质，销毁或统一更新 time uniform 时需要遍历 */
	readonly sideMaterials = new Set<ShaderMaterial>();
	/** 共享的「整体显现」进度 uniform：顶层地图与下钻子级共用同一引用，改一处即整体同步 */
	readonly bodyReveal = { value: 1 };
	/** 侧壁纹理，由外部在纹理加载完成后注入；材质里的 uniform 持有的是同一个 Texture 引用 */
	sideTexture: Texture | undefined;

	/**
	 * 经纬度 → 世界坐标。
	 * @param coordinates [经度, 纬度]，东经/北纬为正
	 * @param height 返回点的 z 高度（世界坐标），默认 0.32，即高于地图底面的贴图层
	 * @returns 世界坐标点，x 向东、y 向北、z 向上
	 */
	point(coordinates: [number, number], height = 0.32) {
		// GeoJSON 取整偶尔会让经度刚好越过 180° 的投影回绕边界，先夹紧避免投影返回 NaN
		const longitude = Math.max(-180, Math.min(180, coordinates[0]));
		const projected = this.projection([longitude, coordinates[1]]) as [
			number,
			number,
		];
		// 屏幕坐标 y 向下，而地图的北向应当朝上，因此取负号翻转
		return new Vector3(projected[0], -projected[1], height);
	}

	/**
	 * 按最小间距抽稀闭合环，减少顶点数量。
	 * @param ring GeoJSON 环坐标
	 * @param threshold 相邻保留点的最小间距（世界坐标），默认 0.012
	 * @returns 世界坐标下的二维顶点数组，末点强制保留以维持闭合
	 */
	simplifyRing(ring: Position[], threshold = 0.012) {
		const result: Vector2[] = [];
		let previous: Vector2 | undefined;
		for (let i = 0; i < ring.length; i++) {
			const p = this.point([ring[i][0], ring[i][1]]);
			const v = new Vector2(p.x, p.y);
			// 保留与上一个保留点间距达标的顶点；末点无条件保留，否则环会缺一段而无法闭合
			if (
				!previous ||
				previous.distanceTo(v) >= threshold ||
				i === ring.length - 1
			) {
				result.push(v);
				previous = v;
			}
		}
		return result;
	}

	/**
	 * 把要素转成 three 的 Shape 列表，供 ShapeGeometry/ExtrudeGeometry 使用。
	 * @param threshold 抽稀阈值（世界坐标），默认 0.012；下钻层级会乘上更小的系数以保留细节
	 * @returns 每个外环一个 Shape，环内的孔洞（湖泊等）挂到 shape.holes
	 */
	shapes(feature: MapFeature, threshold = 0.012) {
		return polygonsOf(feature).flatMap((polygon) => {
			// 少于 3 个点无法围成面，直接丢弃
			if (!polygon[0] || polygon[0].length < 3) return [];
			const vertices = this.simplifyRing(polygon[0], threshold);
			if (vertices.length < 3) return [];
			const shape = new Shape(vertices);
			for (const ring of polygon.slice(1)) {
				const hole = this.simplifyRing(ring, threshold);
				if (hole.length > 2) shape.holes.push(new Shape(hole));
			}
			return [shape];
		});
	}

	/**
	 * 创建顶面材质：按包围盒做对角渐变、叠加方形点阵，并支持悬停高亮与逐块淡入。
	 * @param bounds (最小 x, 最小 y, 宽度) 构成的范围，用于把世界坐标归一化到 0~1；默认值是整块中国地图的估算范围
	 * @param height 地图在南北方向的跨度，配合 bounds 控制纵向渐变与点阵密度
	 * @param focused 是否已聚焦（下钻后父级块会略微变暗）
	 * @param reveal 显现进度对象，时间线改写 value 即可驱动单块淡入
	 */
	topMaterial(
		bounds = new Vector3(-7.5, -4, 15),
		height = 9,
		focused = false,
		reveal = { value: 1 },
	) {
		// 点阵使用世界坐标而非 uv：地图平移时点阵跟着一起走；
		// 片元里的 fwidth 用来判断格子落到屏幕上多大，缩小时自动退化成平均灰度，避免摩尔纹
		return new ShaderMaterial({
			uniforms: {
				bodyReveal: this.bodyReveal,
				faceReveal: reveal,
				hovered: { value: 0 },
				mapBounds: { value: bounds },
				mapHeight: { value: height },
				focused: { value: focused ? 1 : 0 },
			},
			vertexShader:
				"varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
			fragmentShader: `
				varying vec3 vPosition;
				uniform float hovered;
				uniform float bodyReveal;
				uniform float faceReveal;
				uniform vec3 mapBounds;
				uniform float mapHeight;
				uniform float focused;
				void main() {
					float along = clamp((vPosition.x - mapBounds.x) / mapBounds.z, 0., 1.);
					float north = clamp((vPosition.y - mapBounds.y) / max(mapHeight,.00001), 0., 1.);
					vec3 dark = mix(vec3(.016,.072,.16), vec3(.02,.095,.20), focused);
					vec3 blue = mix(vec3(.065,.30,.62), vec3(.06,.28,.56), focused);
					float gradient = pow(clamp(along*.88 + north*.12, 0., 1.), 1.2);
					vec3 color = mix(dark, blue, .08 + gradient*.86);
					// Fixed square dots use map coordinates and resolve gradually when zooming in.
					float spacing = .078 * max(mapBounds.z / 15., .00001);
					vec2 grid = (vPosition.xy - mapBounds.xy) / spacing;
					vec2 footprint = fwidth(grid);
					vec2 cell = abs(fract(grid) - .5);
					vec2 aa = max(footprint * .5, vec2(.025));
					vec2 square = 1. - smoothstep(vec2(.17) - aa, vec2(.17) + aa, cell);
					float detail = 1. - smoothstep(.16, .38, max(footprint.x, footprint.y));
					float coverage = mix(.1156, square.x * square.y, detail);
					color += vec3(.008,.018,.030) * coverage;
					color = mix(color, vec3(.30,.70,.90), hovered);
					gl_FragColor = vec4(color,bodyReveal * faceReveal);
					#include <colorspace_fragment>
				}
			`,
			side: DoubleSide,
		});
	}

	/**
	 * 为要素的每个外环生成一条 LineLoop 描边，并挂到指定分组。
	 * @param height 描边所在的 z 高度（世界坐标），一般比所在面片的顶面略高以防共面
	 * @param skipSmall 是否跳过顶点过少的环（小岛礁），避免远景出现碎点
	 * @param spatialScale 层级缩放系数，同时作用于抽稀阈值，下钻越深保留越多细节
	 * @param context 是否作为「周边环境」处理，为 true 时会套上屏幕边缘淡出
	 * @returns 该要素共用的线材质，便于调用方统一做透明度动画
	 */
	lines(
		feature: MapFeature,
		group: Group,
		height: number,
		color: string,
		opacity: number,
		skipSmall = false,
		spatialScale = 1,
		context = false,
	) {
		const material = new LineBasicMaterial({
			color,
			transparent: true,
			opacity,
			depthTest: true,
		});
		if (context) this.contextMaterial(material);
		for (const polygon of polygonsOf(feature)) {
			const ring = polygon[0];
			if (!ring?.length) continue;
			const points = this.simplifyRing(ring, 0.012 * spatialScale);
			if (skipSmall && points.length < 7) continue;
			const geometry = new BufferGeometry().setFromPoints(
				points.map((v) => new Vector3(v.x, v.y, height)),
			);
			const line = new LineLoop(geometry, material);
			// 描边统一排在较后的序号，保证压在色块与顶面之上，不被透明排序打乱
			line.renderOrder = 5;
			group.add(line);
		}
		return material;
	}

	/**
	 * 创建侧壁材质：按高度从深蓝渐变到亮蓝，叠加向上流动的光带、纤维纹与错落的方块光点，
	 * 模拟立体块的剖面质感。
	 * @param depth 该层的拉伸厚度（世界坐标），shader 用它把局部 z 归一化到 0~1
	 * @param spatialScale 层级缩放系数，用于让纹理条带密度在各层级保持相近的视觉密度
	 * @returns 新建的侧壁材质，同时登记到 sideMaterials 以便统一推进动画
	 */
	sideMaterial(depth = 0.36, spatialScale = 1) {
		// 每层厚度与缩放都不同，材质不做跨层复用；调用方在销毁时按 sideMaterials 集合统一 dispose
		const material = new ShaderMaterial({
			uniforms: {
				bodyReveal: this.bodyReveal,
				sideMap: { value: this.sideTexture },
				time: { value: 0 },
				depth: { value: depth },
				wallScale: { value: spatialScale },
			},
			vertexShader:
				"varying float height;varying vec2 sideUv;void main(){height=position.z;sideUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
			fragmentShader: `
				varying float height;
				varying vec2 sideUv;
				uniform sampler2D sideMap;
				uniform float time;
				uniform float depth;
				uniform float wallScale;
				uniform float bodyReveal;
				void main(){
					float h=clamp(height/depth,0.,1.);
					float u=sideUv.x/max(wallScale,.00001);
					// A fixed phase rises in map height as time increases.
					float rise=h-time*.28;
					float textureStripe=texture2D(sideMap,vec2(sideUv.x,fract(rise))).g;
					float fibers=pow(.5+.5*sin(u*42.),8.);
					float fineFibers=pow(.5+.5*sin(u*84.+1.1),12.);
					float phase=fract(rise+u*.18);
					float flow=pow(1.-phase,4.);
					vec2 cell=fract(vec2(u*12.,rise*4.));
					vec2 cellId=floor(vec2(u*12.,rise*4.));
					float cellLight=.35+.65*fract(sin(dot(cellId,vec2(12.9898,78.233)))*43758.5453);
					float blocks=smoothstep(.18,.25,cell.x)*(1.-smoothstep(.59,.66,cell.x));
					blocks*=smoothstep(.12,.20,cell.y)*(1.-smoothstep(.44,.52,cell.y))*cellLight;
					float dots=(1.-smoothstep(.025,.09,abs(cell.x-.83)))*(1.-smoothstep(.035,.12,abs(cell.y-.76)))*cellLight;
					vec3 color=mix(vec3(.003,.014,.04),vec3(.022,.10,.26),h);
					color+=vec3(.018,.075,.20)*(fibers+.4*fineFibers)*(.3+h*.7);
					color+=vec3(.045,.20,.50)*flow*(.18+fibers*.82);
					color+=vec3(.025,.065,.16)*textureStripe;
					color+=vec3(.025,.10,.24)*blocks+vec3(.04,.16,.34)*dots;
					color+=vec3(.09,.26,.46)*smoothstep(.91,1.,h);

					gl_FragColor=vec4(color,bodyReveal);
					#include <colorspace_fragment>
				}
			`,
			side: DoubleSide,
		});
		// 登记后可在统一循环里推进 time uniform，让各层的流光相位保持一致
		this.sideMaterials.add(material);
		return material;
	}

	/**
	 * 给基础材质包一层屏幕空间淡出：越靠近视口边缘透明度越低，
	 * 使周边国家剪影在画面边界处自然消隐，不会露出生硬的直边。
	 * @param material 被装饰的材质，函数直接改写它并原样返回，方便链式使用
	 */
	contextMaterial<T extends MeshBasicMaterial | LineBasicMaterial>(
		material: T,
	) {
		// 线描边的最小透明度比面片高：面片面积大，淡得过头会整块消失，只剩线条还能辨认轮廓
		const fadeFloor = material instanceof LineBasicMaterial ? 0.14 : 0.035;
		material.depthWrite = false;
		material.onBeforeCompile = (shader) => {
			shader.uniforms.contextViewport = { value: this.contextViewport };
			shader.fragmentShader =
				`uniform vec2 contextViewport;\n${shader.fragmentShader}`.replace(
					"#include <opaque_fragment>",
					`#include <opaque_fragment>
					vec2 screen = gl_FragCoord.xy / contextViewport;
					float sideFade = 1. - smoothstep(.24, .43, abs(screen.x - .5));
					float endFade = 1. - smoothstep(.32, .48, abs(screen.y - .5));
					gl_FragColor.a *= mix(${fadeFloor}, 1., sideFade * endFade);`,
				);
		};
		// three 按「材质类型 + 自定义 key」缓存编译后的程序；fadeFloor 不同必须区分，否则会错用上一份 shader
		material.customProgramCacheKey = () => `context-${fadeFloor}`;
		return material;
	}

	/**
	 * 在多边形内部均匀撒点，作为下钻层的散点、信息点与热力锚点。
	 * @param count 目标点数，边界特别狭长时实际返回可能更少
	 * @param height 采样点的 z 高度（世界坐标）
	 * @returns 落在外环之内、且不在孔洞之内的世界坐标点
	 */
	sampleMap(feature: MapFeature, count: number, height: number) {
		const polygons = polygonsOf(feature).map((polygon) =>
			polygon.map((ring) =>
				ring.map((coordinate) =>
					this.point([coordinate[0], coordinate[1]], height),
				),
			),
		);
		const all = polygons.flatMap((polygon) => polygon[0]);
		const minX = Math.min(...all.map((p) => p.x)),
			maxX = Math.max(...all.map((p) => p.x));
		const minY = Math.min(...all.map((p) => p.y)),
			maxY = Math.max(...all.map((p) => p.y));
		// 射线法：自点向 +x 方向发水平射线，统计与环边界的交点数，奇数即在内部
		const insideRing = (point: Vector3, ring: Vector3[]) => {
			let inside = false;
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const a = ring[i],
					b = ring[j];
				if (
					a.y > point.y !== b.y > point.y &&
					point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
				)
					inside = !inside;
			}
			return inside;
		};
		const result: Vector3[] = [];
		// 0.61803398875（黄金比倒数）与 0.75487766625 作为两个无理步长构成低差异序列，
		// 撒点比纯随机更均匀、不易聚簇；0.08 的内缩边距避免点贴边后被描边遮住。
		// 尝试次数上限 count×100，防止狭长或极小的面片陷入死循环
		for (let i = 1; i < count * 100 && result.length < count; i++) {
			const point = new Vector3(
				minX + (maxX - minX) * (0.08 + ((i * 0.61803398875) % 1) * 0.84),
				minY + (maxY - minY) * (0.08 + ((i * 0.75487766625) % 1) * 0.84),
				height,
			);
			// 必须落在某个外环内、且不落在任何孔洞内，才算有效区域
			if (
				polygons.some(
					(polygon) =>
						insideRing(point, polygon[0]) &&
						!polygon.slice(1).some((hole) => insideRing(point, hole)),
				)
			)
				result.push(point);
		}
		return result;
	}
}

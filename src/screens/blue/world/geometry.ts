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

export const polygonsOf = (feature: MapFeature): Position[][][] =>
	feature.geometry.type === "Polygon"
		? [feature.geometry.coordinates]
		: feature.geometry.coordinates;

export default class MapGeometry {
	readonly projection = geoMercator()
		.center([104.3, 35.7])
		.scale(14)
		.translate([0, 0]);
	readonly contextViewport = new Vector2();
	readonly sideMaterials = new Set<ShaderMaterial>();
	readonly bodyReveal = { value: 1 };
	sideTexture: Texture | undefined;

	point(coordinates: [number, number], height = 0.32) {
		// GeoJSON rounding can put 180° just past the projection's wrap boundary.
		const longitude = Math.max(-180, Math.min(180, coordinates[0]));
		const projected = this.projection([longitude, coordinates[1]]) as [
			number,
			number,
		];
		return new Vector3(projected[0], -projected[1], height);
	}

	simplifyRing(ring: Position[], threshold = 0.012) {
		const result: Vector2[] = [];
		let previous: Vector2 | undefined;
		for (let i = 0; i < ring.length; i++) {
			const p = this.point([ring[i][0], ring[i][1]]);
			const v = new Vector2(p.x, p.y);
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

	shapes(feature: MapFeature, threshold = 0.012) {
		return polygonsOf(feature).flatMap((polygon) => {
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

	topMaterial(
		bounds = new Vector3(-7.5, -4, 15),
		height = 9,
		focused = false,
		reveal = { value: 1 },
	) {
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
			line.renderOrder = 5;
			group.add(line);
		}
		return material;
	}

	sideMaterial(depth = 0.36, spatialScale = 1) {
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
		this.sideMaterials.add(material);
		return material;
	}

	contextMaterial<T extends MeshBasicMaterial | LineBasicMaterial>(
		material: T,
	) {
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
		material.customProgramCacheKey = () => `context-${fadeFloor}`;
		return material;
	}

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
		for (let i = 1; i < count * 100 && result.length < count; i++) {
			const point = new Vector3(
				minX + (maxX - minX) * (0.08 + ((i * 0.61803398875) % 1) * 0.84),
				minY + (maxY - minY) * (0.08 + ((i * 0.75487766625) % 1) * 0.84),
				height,
			);
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

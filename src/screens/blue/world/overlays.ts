import {
	AdditiveBlending,
	BufferGeometry,
	Color,
	DoubleSide,
	EdgesGeometry,
	Float32BufferAttribute,
	Group,
	Line,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	MeshPhongMaterial,
	PlaneGeometry,
	ShaderMaterial,
	Sprite,
	SpriteMaterial,
	TorusGeometry,
	Vector3,
} from "three";
import type SceneTextures from "./textures";

export default class MapOverlays {
	readonly alertAnimations: {
		point: Group;
		body: Group;
		pulse: Mesh<PlaneGeometry, ShaderMaterial>;
		label: Mesh<PlaneGeometry, MeshBasicMaterial>;
		edge: Line<BufferGeometry, LineBasicMaterial>;
		scale: number;
		offset: number;
	}[] = [];
	constructor(private readonly textures: SceneTextures) {}

	createHeatSurface(
		clusters: { position: Vector3; size: number; intensity: number }[],
	) {
		const minX = Math.min(...clusters.map((c) => c.position.x - c.size * 0.65));
		const maxX = Math.max(...clusters.map((c) => c.position.x + c.size * 0.65));
		const minY = Math.min(...clusters.map((c) => c.position.y - c.size * 0.65));
		const maxY = Math.max(...clusters.map((c) => c.position.y + c.size * 0.65));
		const width = maxX - minX,
			height = maxY - minY;
		const resolution = 180 / Math.max(width, height);
		const geometry = new PlaneGeometry(
			width,
			height,
			Math.max(32, Math.ceil(width * resolution)),
			Math.max(32, Math.ceil(height * resolution)),
		);
		const vertices = geometry.getAttribute("position");
		const values = new Float32Array(vertices.count);
		const averageSize =
			clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length;
		for (let index = 0; index < vertices.count; index++) {
			const x = vertices.getX(index) + (minX + maxX) / 2;
			const y = vertices.getY(index) + (minY + maxY) / 2;
			// Sum density before creating height: neighbouring peaks share slopes and valleys.
			let density = 0;
			for (const cluster of clusters) {
				const radius =
					((x - cluster.position.x) ** 2 + (y - cluster.position.y) ** 2) /
					(cluster.size * 0.5) ** 2;
				density += Math.exp(-radius * 2.6) * cluster.intensity;
			}
			values[index] = density;
			vertices.setZ(
				index,
				Math.max(0, density - 0.045) ** 0.9 * averageSize * 0.3,
			);
		}
		geometry.setAttribute("heat", new Float32BufferAttribute(values, 1));
		geometry.computeVertexNormals();
		const surface = new Mesh(
			geometry,
			new ShaderMaterial({
				vertexShader: `attribute float heat;varying float density;varying vec3 surfaceNormal;
				void main(){density=heat;surfaceNormal=normal;
				gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying float density;varying vec3 surfaceNormal;
				void main(){float value=density;
				vec3 c=mix(vec3(.015,.24,.70),vec3(.015,.87,.34),smoothstep(.045,.24,value));
				c=mix(c,vec3(.5,.96,.01),smoothstep(.24,.46,value));
				c=mix(c,vec3(1.,.94,.005),smoothstep(.46,.82,value));
				c=mix(c,vec3(1.,.60,.005),smoothstep(1.05,1.75,value));
				float light=.72+.28*max(0.,dot(normalize(surfaceNormal),normalize(vec3(-.6,.7,1.))));
				float alpha=smoothstep(.025,.16,value)*.87;
				gl_FragColor=vec4(c*light,alpha);
				#include <colorspace_fragment>}`,
				transparent: true,
				depthWrite: false,
				side: DoubleSide,
			}),
		);
		surface.name = "ContinuousHeatMountains";
		surface.position.set(
			(minX + maxX) / 2,
			(minY + maxY) / 2,
			Math.min(...clusters.map((c) => c.position.z)),
		);
		surface.renderOrder = 9;
		return surface;
	}

	createAlertPoints(pointLayer: Group, positions: Vector3[], spatialScale = 1) {
		const markerScale = spatialScale * 0.65;
		positions.slice(0, 4).forEach((position, index) => {
			const color = index % 2 === 0 ? "#97f7d7" : "#ff9bd9";
			const point = new Group();
			point.name = `ChinaAlertPoint-${index + 1}`;
			point.position.copy(position);
			const body = new Group();
			body.position.z = 0.46 * markerScale;
			const geometry = new BufferGeometry();
			const facets = [
				[0, 0, 0.29],
				[0, 0, -0.34],
				[-0.25, 0, 0.1],
				[0, -0.2, 0.1],
				[0.25, 0, 0.1],
				[0, 0.2, 0.1],
			];
			const faces = [
				0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 2, 1, 3, 2, 1, 4, 3, 1, 5, 4, 1, 2, 5,
			];
			geometry.setAttribute(
				"position",
				new Float32BufferAttribute(
					faces.flatMap((vertex) =>
						facets[vertex].map((value) => value * markerScale),
					),
					3,
				),
			);
			geometry.computeVertexNormals();
			const pyramid = new Mesh(
				geometry,
				new MeshPhongMaterial({
					color,
					emissive: new Color(color).multiplyScalar(0.25),
					flatShading: true,
					shininess: 70,
					transparent: true,
					opacity: 0.96,
					depthWrite: false,
					depthTest: false,
				}),
			);
			body.add(
				pyramid,
				new LineSegments(
					new EdgesGeometry(geometry),
					new LineBasicMaterial({
						color: "#e9ffff",
						transparent: true,
						opacity: 0.48,
						depthTest: false,
					}),
				),
			);
			const ring = new Mesh(
				new TorusGeometry(0.28 * markerScale, 0.014 * markerScale, 6, 64),
				new MeshBasicMaterial({
					color: "#efffff",
					transparent: true,
					opacity: 0.95,
					blending: AdditiveBlending,
					depthWrite: false,
					depthTest: false,
				}),
			);
			const pulse = new Mesh(
				new PlaneGeometry(1.35 * markerScale, 1.35 * markerScale),
				new ShaderMaterial({
					uniforms: {
						time: { value: 0 },
						offset: { value: index * 0.23 },
						color: { value: new Color(color) },
					},
					vertexShader:
						"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
					fragmentShader: `varying vec2 vUv;uniform float time;uniform float offset;uniform vec3 color;
					void main(){float phase=fract(time*.34+offset);vec2 p=vUv-.5;float d=length(p);
					float radius=.22+phase*.18;float wave=1.-smoothstep(.006,.018,abs(d-radius));
					float angle=fract(atan(p.y,p.x)/6.28318-time*.12+offset);
					float segments=smoothstep(.02,.04,fract(angle*3.))*(1.-smoothstep(.56,.60,fract(angle*3.)));
					float rim=(1.-smoothstep(.006,.014,abs(d-.29)))*segments;
					float halo=exp(-d*d*55.)*.48;
					gl_FragColor=vec4(mix(color,vec3(.87,.98,1.),.55),wave*(1.-phase)*.5+rim*.88+halo);
					#include <colorspace_fragment>}`,
					transparent: true,
					blending: AdditiveBlending,
					depthWrite: false,
					depthTest: false,
					side: DoubleSide,
				}),
			);
			const beamGeometry = new PlaneGeometry(
				0.42 * markerScale,
				0.48 * markerScale,
			);
			beamGeometry.translate(0, 0.24 * markerScale, 0);
			const beamMaterial = new ShaderMaterial({
				uniforms: { color: { value: new Color(color) } },
				vertexShader: `varying vec2 vUv;void main(){vUv=uv;
					gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
				fragmentShader: `varying vec2 vUv;uniform vec3 color;
					void main(){float x=abs(vUv.x-.5);float fade=pow(clamp(1.-vUv.y,0.,1.),1.25);
					float glow=exp(-x*x*35.)*fade*.55;
					float core=exp(-x*x*700.)*fade;
					gl_FragColor=vec4(mix(color,vec3(1.),core),glow+core);
					#include <colorspace_fragment>}`,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				side: DoubleSide,
				blending: AdditiveBlending,
			});
			const beam = new Mesh(beamGeometry, beamMaterial);
			beam.rotation.x = Math.PI / 2;
			const beamPartner = beam.clone();
			beamPartner.rotation.y = Math.PI / 2;
			const glow = new Sprite(
				new SpriteMaterial({
					map: this.textures.glow(color),
					transparent: true,
					depthTest: false,
					depthWrite: false,
					blending: AdditiveBlending,
					opacity: 0.85,
				}),
			);
			glow.scale.setScalar(0.42 * markerScale);
			glow.position.z = 0.025 * markerScale;
			point.add(body, ring, pulse, beam, beamPartner, glow);
			point.traverse((object) => {
				if (
					object instanceof Mesh ||
					object instanceof LineSegments ||
					object instanceof Sprite
				)
					object.renderOrder = object === pyramid ? 15 : 14;
			});
			pointLayer.add(point);
			const texture = this.textures.canvas(384, 112, (context) => {
				context.scale(2, 2);
				context.fillStyle = index % 2 ? "#27102580" : "#03262980";
				context.fillRect(4, 5, 184, 46);
				context.strokeStyle = color;
				context.globalAlpha = 0.65;
				context.lineWidth = 1;
				context.strokeRect(4.5, 5.5, 183, 45);
				context.globalAlpha = 1;
				context.shadowColor = color;
				context.shadowBlur = 5;
				context.fillStyle = color;
				context.fillRect(4, 11, 2, 34);
				context.fillRect(186, 11, 2, 34);
				context.shadowBlur = 0;
				context.font = '600 28px "Alibaba PuHuiTi", "PingFang SC", sans-serif';
				context.textAlign = "center";
				context.textBaseline = "middle";
				context.fillStyle = "#f5ffff";
				context.fillText(`告警点#${index + 1}`, 96, 28);
			});
			const labelWidth = 1.7 * spatialScale;
			const labelHeight = (labelWidth * 112) / 384;
			const label = new Mesh(
				new PlaneGeometry(labelWidth, labelHeight).translate(
					0,
					labelHeight / 2,
					0,
				),
				new MeshBasicMaterial({
					map: texture,
					transparent: true,
					depthTest: true,
					depthWrite: false,
					toneMapped: false,
					side: DoubleSide,
				}),
			);
			label.name = `ChinaAlertLabel-${index + 1}`;
			// Stand the plate in the map's XZ plane, anchored just above the pyramid tip.
			label.rotation.x = Math.PI / 2;
			label.position.z = 0.6 * spatialScale;
			label.renderOrder = 20;
			label.raycast = () => undefined;
			label.userData.alertLabel = true;
			const edge = new Line(
				new BufferGeometry().setFromPoints([
					new Vector3(-labelWidth / 2, 0, 0),
					new Vector3(labelWidth / 2, 0, 0),
				]),
				new LineBasicMaterial({
					color,
					transparent: true,
					opacity: 0.65,
					depthWrite: false,
					toneMapped: false,
				}),
			);
			edge.renderOrder = 21;
			edge.raycast = () => undefined;
			label.add(edge);
			point.add(label);
			this.alertAnimations.push({
				point,
				body,
				pulse,
				label,
				edge,
				scale: markerScale,
				offset: index * 0.7,
			});
		});
	}
}

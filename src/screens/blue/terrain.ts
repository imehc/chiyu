import { DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from "three";

export interface TerrainBounds {
	/** Center in the map's projected, local XY coordinates. */
	x: number;
	y: number;
	width: number;
	height: number;
	/** The spatial scale used by the region's extruded sides and markers. */
	scale: number;
}

const NATIONAL_BOUNDS: TerrainBounds = {
	x: 0,
	y: 0,
	width: 15,
	height: 10,
	scale: 1,
};

const FRAGMENT_SHADER = /* glsl */ `
	varying vec2 vPlane;
	uniform float time;
	uniform float reveal;


	float hash(vec2 p) {
		return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
	}

	float fineLine(float distance, float width) {
		float aa = max(fwidth(distance), .00015);
		return 1. - smoothstep(width, width + aa * 1.15, abs(distance));
	}

	float grid(vec2 p, float spacing, float width) {
		vec2 d = abs(fract(p / spacing - .5) - .5) * spacing;
		return fineLine(min(d.x, d.y), width);
	}

	float window(float p, float start, float end, float softness) {
		return smoothstep(start, start + softness, p)
			* (1. - smoothstep(end - softness, end, p));
	}

	void main() {
		// These coordinates are relative to the current region's longest side.
		// Pixel derivatives keep the details thin at every camera distance.
		vec2 p = vPlane * 1.12;
		float radius = length(p);
		float groundFade = 1. - smoothstep(.38, .86, radius);
		float innerFade = .55 + .45 * smoothstep(.13, .44, radius);

		vec2 tile = p / .14;
		vec2 tileId = floor(tile);
		vec2 tileUv = fract(tile) - .5;
		float tileSeed = hash(tileId);
		float inset = 1. - smoothstep(.445, .49, max(abs(tileUv.x), abs(tileUv.y)));
		float panel = (.13 + tileSeed * .87) * inset;
		float largerPanel = hash(floor(tile / 2.) + 19.);

		vec3 color = vec3(.005, .013, .029);
		color += vec3(.004, .010, .022) * panel;
		color += vec3(.002, .004, .010) * largerPanel;

		float minorGrid = grid(p, .035, .00028);
		float majorGrid = grid(p, .14, .00052);
		float lattice = grid(p + vec2(.0175), .28, .0004);
		color += vec3(.016, .052, .096) * minorGrid * .13;
		color += vec3(.022, .085, .154) * majorGrid * .18;
		color += vec3(.012, .035, .074) * lattice * .14;

		// Sparse corner markings and short circuit traces belong to the floor,
		// rather than adding fabricated roads or geographic features.
		float circuit = fineLine(tileUv.x - .29, .008)
			* window(tileUv.y, -.31, .18, .06) * step(.88, tileSeed);
		circuit += fineLine(tileUv.y + .31, .008)
			* window(tileUv.x, -.13, .3, .055) * step(.88, tileSeed);
		float cross = fineLine(tileUv.x + .28, .006)
			* window(tileUv.y, .19, .35, .025);
		cross += fineLine(tileUv.y - .27, .006)
			* window(tileUv.x, -.36, -.2, .025);
		cross *= step(.79, hash(tileId + 7.3));
		color += vec3(.025, .12, .18) * (circuit * .16 + cross * .18);

		// A broad, dim sweep reveals the grid without washing out the map.
		float scanPosition = mod(time * .052 + .6, 2.4) - 1.2;
		float scanDistance = p.y + p.x * .18 - scanPosition;
		float scan = exp(-abs(scanDistance) * 26.);
		color += vec3(.011, .047, .082) * scan * (.22 + majorGrid * .33);
		color += vec3(.026, .090, .135) * fineLine(scanDistance, .0007) * .06;

		// Only a few grid lanes carry moving glints. They are computed here,
		// so drilldown needs neither new line geometries nor particle pools.
		float horizontalLane = floor(p.y / .14);
		float hSeed = hash(vec2(horizontalLane, 32.));
		float hTravel = mod(p.x - time * .078 + hSeed * 2.4, 2.4);
		float hTrack = fineLine(fract(p.y / .14) * .14 - .042, .0007);
		float horizontal = hTrack * window(hTravel, .08, .25, .018)
			* smoothstep(.08, .25, hTravel) * step(.85, hSeed);
		float verticalLane = floor(p.x / .14);
		float vSeed = hash(vec2(verticalLane, 74.));
		float vTravel = mod(p.y + time * .057 + vSeed * 2.4, 2.4);
		float vTrack = fineLine(fract(p.x / .14) * .14 - .098, .0007);
		float vertical = vTrack * window(vTravel, .12, .23, .015)
			* (1. - smoothstep(.12, .23, vTravel)) * step(.89, vSeed);
		color += vec3(.055, .235, .29) * (horizontal + vertical) * .34;

		// The original China dashboard's cross grid and regular dotted ground.
		vec2 crossUv = fract(p / .14 + .5) - .5;
		float crossGrid = fineLine(crossUv.x, .006) * window(crossUv.y, -.07, .07, .004)
			+ fineLine(crossUv.y, .006) * window(crossUv.x, -.07, .07, .004);
		vec2 pointUv = fract(p / .012) - .5;
		float dots = 1. - smoothstep(.045, .13, length(pointUv));
		color += vec3(.028, .12, .21) * crossGrid * .5;
		color += vec3(.016, .09, .16) * dots * .25;

		float alpha = groundFade * innerFade * reveal * .82;
		if (alpha < .003) discard;
		gl_FragColor = vec4(color, alpha);
		#include <colorspace_fragment>
	}
`;

/**
 * A single draw call for the map's grid, tiled floor, and scanning rings.
 * Add group to the map's local XY group; its parent supplies rotation.x=-PI/2.
 * Call update with elapsed seconds only while the China view is visible.
 */
export default class MapTerrain {
	readonly group = new Group();
	private readonly geometry = new PlaneGeometry(2, 2);
	private readonly material = new ShaderMaterial({
		uniforms: {
			time: { value: 0 },
			reveal: { value: 1 },
		},
		vertexShader: /* glsl */ `
			varying vec2 vPlane;
			void main() {
				vPlane = position.xy;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
			}
		`,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthTest: true,
		depthWrite: false,
		side: DoubleSide,
		forceSinglePass: true,
		toneMapped: false,
	});
	private readonly plane = new Mesh(this.geometry, this.material);
	private animationRate = 1;
	private revealAge = 1;
	private previousSeconds: number | undefined;
	private disposed = false;

	constructor() {
		this.group.name = "MapTerrain";
		this.plane.name = "MapTerrainFloor";
		this.plane.renderOrder = -2;
		this.plane.raycast = () => undefined;
		this.group.add(this.plane);
		this.setRegion();
	}

	setRegion(bounds: TerrainBounds = NATIONAL_BOUNDS): void {
		if (this.disposed) return;
		const width = Number.isFinite(bounds.width) ? Math.abs(bounds.width) : 15;
		const height = Number.isFinite(bounds.height)
			? Math.abs(bounds.height)
			: 10;
		const span = Math.max(width, height, 0.001);
		const scale = Number.isFinite(bounds.scale)
			? Math.max(0.0001, Math.abs(bounds.scale))
			: Math.min(1, span / 15);
		this.group.position.set(
			Number.isFinite(bounds.x) ? bounds.x : 0,
			Number.isFinite(bounds.y) ? bounds.y : 0,
			-0.08 * scale,
		);
		this.plane.scale.set(span * 1.12, span * 1.12, 1);
		// Coordinates already scale with the footprint, so smaller regions
		// retain the same screen detail and only slightly slower scan cadence.
		this.animationRate = 0.84 + 0.16 * Math.sqrt(Math.min(scale, 1));
		this.revealAge = 0;
		this.material.uniforms.reveal.value = 0.55;
	}

	update(seconds: number): void {
		if (this.disposed || !this.group.visible || !Number.isFinite(seconds))
			return;
		const delta =
			this.previousSeconds === undefined
				? 1 / 60
				: Math.min(0.1, Math.max(0, seconds - this.previousSeconds));
		this.previousSeconds = seconds;
		this.revealAge += delta;
		this.material.uniforms.time.value = seconds * this.animationRate;
		this.material.uniforms.reveal.value =
			0.55 + 0.45 * (1 - Math.exp(-this.revealAge * 5));
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.group.removeFromParent();
		this.group.clear();
		this.geometry.dispose();
		this.material.dispose();
	}
}

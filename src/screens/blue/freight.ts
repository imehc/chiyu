import {
	AdditiveBlending,
	BufferGeometry,
	CanvasTexture,
	CatmullRomCurve3,
	Color,
	Curve,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineSegments,
	type Material,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	ShaderMaterial,
	SphereGeometry,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	type Texture,
	TorusGeometry,
	TubeGeometry,
	Vector3,
} from "three";

export type FreightMode = "rail" | "sea" | "air";

type Coordinates = readonly [longitude: number, latitude: number];

interface Route {
	id: string;
	name: string;
	mode: FreightMode;
	curve: Curve<Vector3>;
	waypoints: readonly Coordinates[];
	speed: number;
	offset: number;
	progress: number;
	height: number;
	tail: ShaderMaterial;
	vehicle?: Group;
}

const COLORS: Record<FreightMode, string> = {
	rail: "#f6dc43",
	sea: "#29e797",
	air: "#a7d7f3",
};
const SURFACE_RADIUS = 5.18;
const UP = new Vector3(0, 1, 0);
const BEIJING: Coordinates = [116.4, 39.9];

// The intermediate stations keep the railway on the Eurasian land corridor.
const RAIL_WAYPOINTS: readonly Coordinates[] = [
	[121.47, 31.23],
	[117.23, 31.82],
	[113.62, 34.75],
	[108.94, 34.34],
	[103.83, 36.06],
	[98.29, 39.78],
	[93.51, 42.83],
	[87.62, 43.82],
	[82.57, 45.17],
	[80.22, 46.95],
	[75.33, 48.32],
	[73.1, 49.8],
	[71.43, 51.13],
	[69.14, 54.88],
	[60.6, 56.83],
	[49.11, 55.79],
	[37.62, 55.75],
	[27.56, 53.9],
	[23.69, 52.1],
	[21.01, 52.23],
	[13.41, 52.52],
	[6.76, 51.43],
];

// Coastal approaches, narrow straits and the canal are explicit waypoints;
// a direct Shanghai–Europe great circle would cut through mainland Asia.
const SEA_WAYPOINTS: readonly Coordinates[] = [
	[122.05, 31.1],
	[122.6, 28],
	[122.5, 25.5],
	[121.7, 23],
	[120.2, 21],
	[116.5, 17],
	[110.7, 11],
	[106, 4.5],
	[104.9, 1.55],
	[104.2, 1.05],
	[103.4, 1.3],
	[101.7, 2],
	[100.5, 3.15],
	[99.5, 4.3],
	[98.3, 6],
	[96.4, 6.4],
	[94.5, 6.3],
	[89, 5.5],
	[82, 5.2],
	[80, 5],
	[70, 8],
	[60, 11.4],
	[54, 13],
	[49, 12.5],
	[45.4, 12],
	[43.4, 12.6],
	[42.3, 15],
	[39.8, 20],
	[36, 25.5],
	[33.9, 27.4],
	[32.6, 29.5],
	[32.52, 29.92],
	[32.43, 30.3],
	[32.32, 30.56],
	[32.35, 30.82],
	[32.3, 31.1],
	[32.35, 31.35],
	[29, 32.6],
	[22, 33.5],
	[15.5, 35],
	[11, 37.6],
	[5, 38.2],
	[0, 37.3],
	[-2.5, 36.2],
	[-4.8, 36],
	[-5.58, 35.95],
	[-6.1, 36],
	[-8.2, 36.1],
	[-9.9, 36.8],
	[-10, 40],
	[-10, 44],
	[-7, 48],
	[-5, 49.4],
	[-2, 50.3],
	[0.7, 50.8],
	[1.5, 51.1],
	[2.6, 51.7],
	[3.7, 52],
	[4.05, 51.95],
];

const AIR_DESTINATIONS: {
	id: string;
	name: string;
	coordinates: Coordinates;
	height: number;
	offset: number;
	vehicle: boolean;
}[] = [
	{
		id: "tokyo",
		name: "东京",
		coordinates: [139.76, 35.68],
		height: 0.9,
		offset: 0.28,
		vehicle: false,
	},
	{
		id: "seoul",
		name: "首尔",
		coordinates: [126.98, 37.57],
		height: 0.65,
		offset: 0.72,
		vehicle: false,
	},
	{
		id: "moscow",
		name: "莫斯科",
		coordinates: [37.62, 55.75],
		height: 2.05,
		offset: 0.46,
		vehicle: false,
	},
	{
		id: "paris",
		name: "巴黎",
		coordinates: [2.35, 48.86],
		height: 2.65,
		offset: 0.61,
		vehicle: false,
	},
	{
		id: "dubai",
		name: "迪拜",
		coordinates: [55.27, 25.2],
		height: 1.85,
		offset: 0.35,
		vehicle: false,
	},
	{
		id: "singapore",
		name: "新加坡",
		coordinates: [103.82, 1.35],
		height: 1.3,
		offset: 0.77,
		vehicle: true,
	},
	{
		id: "sydney",
		name: "悉尼",
		coordinates: [151.21, -33.87],
		height: 2.55,
		offset: 0.2,
		vehicle: false,
	},
	{
		id: "cairo",
		name: "开罗",
		coordinates: [31.24, 30.04],
		height: 2.3,
		offset: 0.84,
		vehicle: false,
	},
	{
		id: "mumbai",
		name: "孟买",
		coordinates: [72.8, 19.1],
		height: 1.2,
		offset: 0.17,
		vehicle: false,
	},
	{
		id: "new-delhi",
		name: "新德里",
		coordinates: [77.2, 28.6],
		height: 1.5,
		offset: 0.53,
		vehicle: false,
	},
	{
		id: "bangkok",
		name: "曼谷",
		coordinates: [100.5, 13.7],
		height: 1.1,
		offset: 0.63,
		vehicle: false,
	},
	{
		id: "naypyidaw",
		name: "内比都",
		coordinates: [96.1, 19.7],
		height: 1.35,
		offset: 0.41,
		vehicle: false,
	},
	{
		id: "manila",
		name: "马尼拉",
		coordinates: [121, 14.6],
		height: 1.15,
		offset: 0.89,
		vehicle: false,
	},
	{
		id: "perth",
		name: "珀斯",
		coordinates: [115.9, -31.9],
		height: 2.0,
		offset: 0.31,
		vehicle: false,
	},
	{
		id: "canberra",
		name: "堪培拉",
		coordinates: [149.1, -35.3],
		height: 2.45,
		offset: 0.57,
		vehicle: false,
	},
	{
		id: "jakarta",
		name: "雅加达",
		coordinates: [106.8, -6.2],
		height: 1.55,
		offset: 0.73,
		vehicle: false,
	},
];

const spherical = (coordinates: Coordinates, radius = 1) => {
	const longitude = (coordinates[0] * Math.PI) / 180;
	const latitude = (coordinates[1] * Math.PI) / 180;
	return new Vector3(
		radius * Math.cos(longitude) * Math.cos(latitude),
		radius * Math.sin(latitude),
		-radius * Math.sin(longitude) * Math.cos(latitude),
	);
};

const interpolateSphere = (
	start: Vector3,
	end: Vector3,
	t: number,
	result = new Vector3(),
) => {
	const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
	if (angle < 0.00001) return result.copy(start).lerp(end, t).normalize();
	return result
		.copy(start)
		.multiplyScalar(Math.sin((1 - t) * angle))
		.addScaledVector(end, Math.sin(t * angle))
		.normalize();
};

/** Interpolate dense coastal/station points, then lock every sample to the surface. */
class SurfaceRouteCurve extends Curve<Vector3> {
	private readonly path: CatmullRomCurve3;

	constructor(waypoints: readonly Coordinates[]) {
		super();
		this.arcLengthDivisions = 800;
		const samples: Vector3[] = [];
		for (let index = 0; index < waypoints.length - 1; index++) {
			const start = spherical(waypoints[index]);
			const end = spherical(waypoints[index + 1]);
			const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
			const steps = Math.max(2, Math.ceil(angle / 0.012));
			for (let step = 0; step < steps; step++)
				samples.push(interpolateSphere(start, end, step / steps));
		}
		samples.push(spherical(waypoints[waypoints.length - 1]));
		this.path = new CatmullRomCurve3(samples, false, "centripetal");
	}

	getPoint(t: number, target = new Vector3()) {
		return this.path
			.getPoint(t, target)
			.normalize()
			.multiplyScalar(SURFACE_RADIUS);
	}
}

/** A true spherical arc rises above the globe, including at long distances. */
class AirRouteCurve extends Curve<Vector3> {
	private readonly start: Vector3;
	private readonly end: Vector3;

	constructor(
		start: Coordinates,
		end: Coordinates,
		private height: number,
	) {
		super();
		this.arcLengthDivisions = 240;
		this.start = spherical(start);
		this.end = spherical(end);
	}

	getPoint(t: number, target = new Vector3()) {
		return interpolateSphere(this.start, this.end, t, target).multiplyScalar(
			SURFACE_RADIUS + Math.sin(t * Math.PI) * this.height,
		);
	}
}

/** Globe-local freight routes: yellow rail, green sea and blue air. */
export default class GlobeFreight {
	readonly group = new Group();
	private readonly modes: Record<FreightMode, Group> = {
		rail: new Group(),
		sea: new Group(),
		air: new Group(),
	};
	private readonly routes: Route[] = [];
	private readonly resources = new Set<BufferGeometry | Material | Texture>();
	private readonly iconTextures = new Map<FreightMode, CanvasTexture>();
	private readonly forward = new Vector3();
	private readonly normal = new Vector3();
	private readonly right = new Vector3();
	private readonly basis = new Matrix4();
	private disposed = false;

	constructor() {
		this.group.name = "global-freight";
		for (const mode of ["rail", "sea", "air"] as const) {
			this.modes[mode].name = `freight-${mode}`;
			this.group.add(this.modes[mode]);
		}
		this.addRoute({
			id: "china-europe-rail",
			name: "上海—中亚—杜伊斯堡",
			mode: "rail",
			curve: new SurfaceRouteCurve(RAIL_WAYPOINTS),
			waypoints: RAIL_WAYPOINTS,
			speed: 0.014,
			offset: 0.24,
			height: 0,
		});
		this.addRoute({
			id: "shanghai-rotterdam-sea",
			name: "上海—马六甲—苏伊士—鹿特丹",
			mode: "sea",
			curve: new SurfaceRouteCurve(SEA_WAYPOINTS),
			waypoints: SEA_WAYPOINTS,
			speed: 0.01,
			offset: 0.12,
			height: 0,
		});
		for (const destination of AIR_DESTINATIONS)
			this.addRoute(
				{
					id: `beijing-${destination.id}-air`,
					name: `北京—${destination.name}`,
					mode: "air",
					curve: new AirRouteCurve(
						BEIJING,
						destination.coordinates,
						destination.height,
					),
					waypoints: [BEIJING, destination.coordinates],
					speed: destination.height < 1 ? 0.048 : 0.031,
					offset: destination.offset,
					height: destination.height,
				},
				destination.vehicle,
			);
		this.update(0);
	}

	private keep<T extends BufferGeometry | Material | Texture>(resource: T): T {
		this.resources.add(resource);
		return resource;
	}

	private addRoute(
		data: Omit<Route, "tail" | "progress" | "vehicle">,
		withVehicle = true,
	) {
		const group = this.modes[data.mode];
		const segments = data.mode === "air" ? 240 : 800;
		const lineColor = data.mode === "air" ? "#d1efff" : COLORS[data.mode];
		if (data.mode === "rail") this.addRailway(data.curve, group);
		else {
			const geometry = this.keep(
				new TubeGeometry(
					data.curve,
					segments,
					data.mode === "sea" ? 0.009 : 0.008,
					8,
					false,
				),
			);
			const material = this.keep(
				new MeshBasicMaterial({
					color: lineColor,
					transparent: true,
					opacity: data.mode === "sea" ? 0.52 : 0.46,
					blending: AdditiveBlending,
					depthWrite: false,
				}),
			);
			group.add(new Mesh(geometry, material));
		}
		const tail = this.keep(
			new ShaderMaterial({
				uniforms: {
					head: { value: data.offset },
					tailLength: { value: data.mode === "air" ? 0.14 : 0.09 },
					color: { value: new Color(lineColor).multiplyScalar(1.6) },
				},
				vertexShader: `varying float progress;
					void main() {
						progress = uv.x;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}`,
				fragmentShader: `varying float progress;
					uniform float head;
					uniform float tailLength;
					uniform vec3 color;
					void main() {
						float distanceBehind = fract(head - progress + 1.0);
						float light = pow(max(0.0, 1.0 - distanceBehind / tailLength), 1.7);
						gl_FragColor = vec4(color * (1.0 + light * 0.35), light * 0.9);
					}`,
				transparent: true,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		group.add(
			new Mesh(
				this.keep(new TubeGeometry(data.curve, segments, 0.012, 8, false)),
				tail,
			),
		);
		const route: Route = { ...data, tail, progress: data.offset };
		if (withVehicle) {
			route.vehicle = this.makeVehicle(data.mode);
			group.add(route.vehicle);
		}
		this.routes.push(route);
		this.addTerminal(data.waypoints[0], data.mode);
		this.addTerminal(data.waypoints[data.waypoints.length - 1], data.mode);
	}

	private addRailway(curve: Curve<Vector3>, group: Group) {
		const length = curve.getLength();
		const divisions = Math.max(180, Math.ceil(length / 0.027));
		const left: Vector3[] = [];
		const right: Vector3[] = [];
		const sleepers: number[] = [];
		const normal = new Vector3();
		const side = new Vector3();
		for (let index = 0; index <= divisions; index++) {
			const t = index / divisions;
			const point = curve.getPointAt(t);
			normal.copy(point).normalize();
			side.crossVectors(curve.getTangentAt(t), normal).normalize();
			left.push(point.clone().addScaledVector(side, 0.018));
			right.push(point.clone().addScaledVector(side, -0.018));
			if (index % 3 === 0) {
				const a = point.clone().addScaledVector(side, -0.035);
				const b = point.clone().addScaledVector(side, 0.035);
				sleepers.push(a.x, a.y, a.z, b.x, b.y, b.z);
			}
		}
		const railMaterial = this.keep(
			new MeshBasicMaterial({
				color: COLORS.rail,
				transparent: true,
				opacity: 0.48,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		for (const points of [left, right])
			group.add(
				new Mesh(
					this.keep(
						new TubeGeometry(
							new CatmullRomCurve3(points),
							divisions,
							0.0055,
							4,
							false,
						),
					),
					railMaterial,
				),
			);
		const ties = this.keep(new BufferGeometry());
		ties.setAttribute("position", new Float32BufferAttribute(sleepers, 3));
		group.add(
			new LineSegments(
				ties,
				this.keep(
					new LineBasicMaterial({
						color: COLORS.rail,
						transparent: true,
						opacity: 0.24,
						depthWrite: false,
					}),
				),
			),
		);
	}

	private addTerminal(coordinates: Coordinates, mode: FreightMode) {
		// Routes sharing a hub also share its marker.
		const key = `terminal-${coordinates.join(",")}`;
		if (this.modes[mode].getObjectByName(key)) return;
		const terminal = new Group();
		terminal.name = key;
		terminal.position.copy(spherical(coordinates, SURFACE_RADIUS + 0.003));
		terminal.quaternion.setFromUnitVectors(
			new Vector3(0, 0, 1),
			terminal.position.clone().normalize(),
		);
		const material = this.keep(
			new MeshBasicMaterial({
				color: COLORS[mode],
				transparent: true,
				opacity: 0.66,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		terminal.add(
			new Mesh(this.keep(new TorusGeometry(0.073, 0.008, 4, 32)), material),
			new Mesh(this.keep(new SphereGeometry(0.026, 8, 6)), material),
		);
		this.modes[mode].add(terminal);
	}

	private makeVehicle(mode: FreightMode) {
		const vehicle = new Group();
		vehicle.name = `moving-${mode}`;
		const icon = new Sprite(
			this.keep(
				new SpriteMaterial({
					map: this.iconTexture(mode),
					transparent: true,
					depthTest: true,
					depthWrite: false,
				}),
			),
		);
		icon.scale.setScalar(mode === "rail" ? 0.46 : mode === "sea" ? 0.44 : 0.37);
		// Billboarding keeps the small glyph legible. Its bearing still comes from
		// the actual curve tangent after globe rotation and camera projection.
		const projectedForward = new Vector3();
		icon.onBeforeRender = (_renderer, _scene, camera) => {
			projectedForward
				.copy(UP)
				.transformDirection(vehicle.matrixWorld)
				.transformDirection(camera.matrixWorldInverse);
			icon.material.rotation = Math.atan2(
				-projectedForward.x,
				projectedForward.y,
			);
		};
		vehicle.add(icon);
		return vehicle;
	}

	private iconTexture(mode: FreightMode) {
		const existing = this.iconTextures.get(mode);
		if (existing) return existing;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 128;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Freight icons require a 2D canvas context");
		context.shadowColor = COLORS[mode];
		context.shadowBlur = 12;
		context.beginPath();
		context.arc(64, 64, 47, 0, Math.PI * 2);
		context.fillStyle = "#06121d";
		context.fill();
		context.lineWidth = 6;
		context.strokeStyle = COLORS[mode];
		context.stroke();
		context.shadowBlur = 0;
		context.fillStyle = COLORS[mode];
		context.strokeStyle = COLORS[mode];
		context.lineWidth = 3;
		context.lineJoin = "round";
		if (mode === "rail") {
			context.beginPath();
			context.roundRect(44, 32, 40, 57, 9);
			context.fill();
			context.fillStyle = "#09202b";
			context.beginPath();
			context.roundRect(49, 40, 30, 20, 4);
			context.fill();
			for (const x of [52, 76]) {
				context.beginPath();
				context.arc(x, 76, 4, 0, Math.PI * 2);
				context.fill();
			}
			context.beginPath();
			context.moveTo(52, 88);
			context.lineTo(44, 99);
			context.moveTo(76, 88);
			context.lineTo(84, 99);
			context.moveTo(48, 95);
			context.lineTo(80, 95);
			context.stroke();
		} else if (mode === "sea") {
			context.beginPath();
			context.moveTo(64, 29);
			context.lineTo(85, 49);
			context.lineTo(84, 84);
			context.quadraticCurveTo(64, 100, 44, 84);
			context.lineTo(43, 49);
			context.closePath();
			context.fill();
			context.fillStyle = "#09202b";
			context.fillRect(54, 43, 20, 13);
			context.fillRect(52, 62, 10, 12);
			context.fillRect(66, 62, 10, 12);
			context.fillRect(52, 77, 10, 9);
			context.fillRect(66, 77, 10, 9);
		} else {
			context.beginPath();
			context.moveTo(64, 26);
			context.lineTo(70, 51);
			context.lineTo(95, 70);
			context.lineTo(95, 77);
			context.lineTo(70, 68);
			context.lineTo(70, 87);
			context.lineTo(80, 96);
			context.lineTo(80, 102);
			context.lineTo(64, 95);
			context.lineTo(48, 102);
			context.lineTo(48, 96);
			context.lineTo(58, 87);
			context.lineTo(58, 68);
			context.lineTo(33, 77);
			context.lineTo(33, 70);
			context.lineTo(58, 51);
			context.closePath();
			context.fill();
		}
		const texture = this.keep(new CanvasTexture(canvas));
		texture.colorSpace = SRGBColorSpace;
		this.iconTextures.set(mode, texture);
		return texture;
	}

	update(seconds: number) {
		if (this.disposed) return;
		for (const route of this.routes) {
			route.progress = (((seconds * route.speed + route.offset) % 1) + 1) % 1;
			route.tail.uniforms.head.value = route.progress;
			if (!route.vehicle) continue;
			const point = route.curve.getPointAt(route.progress);
			this.forward.copy(route.curve.getTangentAt(route.progress)).normalize();
			this.normal.copy(point).normalize();
			this.right.crossVectors(this.forward, this.normal).normalize();
			this.normal.crossVectors(this.right, this.forward).normalize();
			this.basis.makeBasis(this.right, this.forward, this.normal);
			route.vehicle.quaternion.setFromRotationMatrix(this.basis);
			route.vehicle.position.copy(point);
			if (route.mode !== "air")
				route.vehicle.position.addScaledVector(this.normal, 0.065);
		}
	}

	setMode(mode: FreightMode, enabled: boolean) {
		this.modes[mode].visible = enabled;
	}

	getState() {
		return {
			enabled: {
				rail: this.modes.rail.visible,
				sea: this.modes.sea.visible,
				air: this.modes.air.visible,
			},
			routeCount: this.routes.length,
			vehicleCount: this.routes.filter((route) => route.vehicle).length,
			routes: this.routes.map((route) => ({
				id: route.id,
				name: route.name,
				mode: route.mode,
				enabled: this.modes[route.mode].visible,
				progress: route.progress,
				arcHeight: route.height,
				waypointCount: route.waypoints.length,
				vehiclePosition: route.vehicle?.position.toArray(),
				vehicleBearing: route.vehicle?.quaternion.toArray(),
			})),
		};
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.group.removeFromParent();
		this.group.clear();
		for (const resource of this.resources) resource.dispose();
		this.resources.clear();
		this.iconTextures.clear();
	}
}

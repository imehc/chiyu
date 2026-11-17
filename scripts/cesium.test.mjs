// Run with Node.js 22.13+: node --test scripts/cesium.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import {
	Cartesian3,
	Ellipsoid,
	EntityCollection,
	ScreenSpaceEventType,
} from "cesium";

const root = new URL("../src/exmaples/web/cesium/", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const dataUrl = (code) =>
	`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const handlers = [];
globalThis.__cesiumTestHandler = class {
	actions = new Map();
	destroyed = false;
	constructor() {
		handlers.push(this);
	}
	setInputAction(callback, type) {
		this.actions.set(type, callback);
	}
	isDestroyed() {
		return this.destroyed;
	}
	destroy() {
		this.destroyed = true;
		this.actions.clear();
	}
};
const cesiumShim = dataUrl(
	`export * from ${JSON.stringify(import.meta.resolve("cesium"))}; export const ScreenSpaceEventHandler = globalThis.__cesiumTestHandler;`,
);
const toolCode = stripTypeScriptTypes(
	await source("spatial-analysis/04/MeasureTool.ts"),
)
	.replaceAll('"cesium"', JSON.stringify(cesiumShim))
	.replaceAll(
		'"@turf/turf"',
		JSON.stringify(import.meta.resolve("@turf/turf")),
	);
const { MeasureTool } = await import(dataUrl(toolCode));
delete globalThis.__cesiumTestHandler;

function setup(height = () => 0) {
	let point;
	const viewer = {
		entities: new EntityCollection(),
		camera: { getPickRay: () => undefined },
		scene: {
			canvas: {},
			pickPosition: () => point,
			globe: { ellipsoid: Ellipsoid.WGS84, getHeight: height },
		},
	};
	const tool = new MeasureTool({ viewer });
	const send = (type, value) => {
		point = value;
		handlers.at(-1).actions.get(type)?.({ position: {}, endPosition: {} });
	};
	return {
		viewer,
		tool,
		click: (p) => send(ScreenSpaceEventType.LEFT_CLICK, p),
		move: (p) => send(ScreenSpaceEventType.MOUSE_MOVE, p),
		end: () => send(ScreenSpaceEventType.RIGHT_CLICK),
	};
}
const labels = (viewer) =>
	viewer.entities.values
		.filter((e) => e.label)
		.map((e) => e.label.text.getValue());
const close = (actual, expected, tolerance = 0.001) =>
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${actual} != ${expected}`,
	);

test("space distance accumulates clicked endpoints and discards the cursor", () => {
	const { tool, click, move, end, viewer } = setup();
	tool.measureLineSpace();
	click(new Cartesian3(6378137, 0, 0));
	move(new Cartesian3(6378137, 500, 0));
	click(new Cartesian3(6378140, 4, 0));
	click(new Cartesian3(6378143, 8, 0));
	assert.equal(labels(viewer).at(-1), "10.00米\n(+5.00米)");
	move(new Cartesian3(6378137, 500, 0));
	end();
	const points = viewer.entities.values
		.find((e) => e.polyline)
		.polyline.positions.getValue();
	assert.equal(points.length, 3);
	assert.equal(points.at(-1).y, 8);
});
test("small increments are rounded only for display", () => {
	const { tool, click, viewer } = setup();
	tool.measureLineSpace();
	for (let i = 0; i <= 4; i++) click(new Cartesian3(6378137, i * 0.0065, 0));
	assert.equal(labels(viewer).at(-1), "0.03米\n(+0.01米)");
});
test("ground distance accumulates without mouse movement", () => {
	const { tool, click, end, viewer } = setup();
	tool.measureGroundDistance();
	for (const lon of [0, 1, 2]) click(Cartesian3.fromDegrees(lon, 0));
	end();
	assert.equal(labels(viewer).at(-1), "222.639千米\n(+111.319千米)");
	assert.equal(
		viewer.entities.values.find((e) => e.polyline).polyline.positions.getValue()
			.length,
		3,
	);
});
test("ground sampling follows a known slope and missing-height interpolation", () => {
	for (const height of [
		(p) => (p.longitude / (Math.PI / 180)) * 100,
		() => undefined,
	]) {
		const { tool } = setup(height);
		const a = Cartesian3.fromDegrees(0, 0),
			b = Cartesian3.fromDegrees(1, 0, 100);
		close(
			tool.calculateGroundDistance([a, b, b], 0),
			Math.hypot((6378137 * Math.PI) / 180, 100),
		);
		close(tool.calculateGroundDistance([a, a, a], 0), 0);
	}
});
test("polygon area matches a spherical band, reversed winding and date line", () => {
	const { tool } = setup();
	const square = [
		{ lon: 0, lat: 0 },
		{ lon: 1, lat: 0 },
		{ lon: 1, lat: 1 },
		{ lon: 0, lat: 1 },
	];
	const expected =
		(6371008.8 ** 2 * (Math.PI / 180) * Math.sin(Math.PI / 180)) / 1e6;
	close(tool.getArea(square), expected);
	close(tool.getArea([...square].reverse()), expected);
	close(
		tool.getArea(
			square.map((p) => ({ ...p, lon: p.lon === 0 ? 179.5 : -179.5 })),
		),
		expected,
	);
});
test("area requires three points and uses confirmed polygon vertices", () => {
	for (const count of [0, 1, 2, 4]) {
		const { tool, click, move, end, viewer } = setup();
		tool.measureAreaSpace();
		for (const [lon, lat] of [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		].slice(0, count))
			click(Cartesian3.fromDegrees(lon, lat));
		move(Cartesian3.fromDegrees(10, 10));
		end();
		assert.equal(labels(viewer).length, count === 4 ? 1 : 0);
		if (count === 4) assert.equal(labels(viewer)[0], "12363.7181平方公里");
		tool.clear();
		assert.equal(viewer.entities.values.length, 0);
	}
});
test("height and triangle labels use the real 3D chord, including preview updates", () => {
	const theta = Math.PI / 180,
		r1 = 6378237,
		r2 = 6379137;
	const chord = Math.sqrt(
		(r1 - r2) ** 2 + 4 * r1 * r2 * Math.sin(theta / 2) ** 2,
	);
	for (const mode of ["measureAltitude", "measureTriangle"]) {
		const { tool, click, move, viewer } = setup();
		tool[mode]();
		click(Cartesian3.fromDegrees(0, 0, 100));
		move(Cartesian3.fromDegrees(0.5, 0, 500));
		click(Cartesian3.fromDegrees(1, 0, 1000));
		assert.ok(labels(viewer).some((label) => label.includes("900.00")));
		if (mode === "measureTriangle")
			assert.ok(labels(viewer).includes(`空间距离:${chord.toFixed(2)}米`));
		assert.equal(tool.isMeasuring(), false);
	}
});
test("bearing handles cardinal directions, high latitude and date line", () => {
	const { tool } = setup();
	for (const [lon, lat, expected] of [
		[1, 0, 90],
		[-1, 0, 270],
		[0, 1, 0],
		[0, -1, 180],
	])
		close(tool.courseAngle(0, 0, lon, lat), expected);
	close(tool.courseAngle(179, 0, -179, 0), 90);
	close(tool.courseAngle(0, 0, 0, 0), 0);
	const angle =
		(Math.atan2(
			Math.sin(Math.PI / 180) * Math.cos((61 * Math.PI) / 180),
			Math.cos((60 * Math.PI) / 180) * Math.sin((61 * Math.PI) / 180) -
				Math.sin((60 * Math.PI) / 180) *
					Math.cos((61 * Math.PI) / 180) *
					Math.cos(Math.PI / 180),
		) *
			180) /
		Math.PI;
	close(tool.courseAngle(0, 60, 1, 61), angle, 0.1);
});
test("switching all six modes keeps one handler and clear removes every entity", () => {
	const { tool, click, viewer } = setup();
	for (const mode of [
		"measureLineSpace",
		"measureGroundDistance",
		"measureAreaSpace",
		"measureAltitude",
		"measureTriangle",
		"measureAngle",
	]) {
		const previous = handlers.at(-1);
		tool[mode]();
		if (previous) assert.equal(previous.isDestroyed(), true);
		click(Cartesian3.fromDegrees(0, 0));
	}
	tool.clear();
	assert.equal(handlers.at(-1).isDestroyed(), true);
	assert.equal(viewer.entities.values.length, 0);
});

const deferred = () => {
	let resolve, reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const fakeViewer = () => ({
	destroyed: false,
	isDestroyed() {
		return this.destroyed;
	},
	destroy() {
		this.destroyed = true;
	},
});

async function effect(path, loadViewerModule) {
	const code = await source(path);
	const body = code.slice(
		code.indexOf("useEffect(() => {") + 17,
		code.indexOf("\n\t}, []);"),
	);
	const js = stripTypeScriptTypes(
		`function effect(ref) {${body}\n}`,
	).replaceAll('import("./viewer")', "loadViewerModule()");
	return new Function(
		"loadViewerModule",
		`${js}; return effect({current:{}});`,
	)(loadViewerModule);
}
const scenes = [
	"basic/01",
	"basic/06",
	"basic/07",
	"basic/08",
	"basic/09",
	"basic/10",
	"basic/11",
	"basic/12",
	...[1, 2, 3, 4, 5].map((i) => `spatial-analysis/0${i}`),
];
test("all 13 dynamic scene imports ignore completion after unmount", async () => {
	for (const scene of scenes) {
		const pending = deferred();
		let created = 0;
		const cleanup = await effect(`${scene}/index.tsx`, () => pending.promise);
		cleanup();
		pending.resolve({
			initViewer: () => {
				created++;
			},
		});
		await flush();
		assert.equal(created, 0, scene);
	}
});
test("shader viewer is available to cleanup while its tiles are still loading", async () => {
	const viewer = fakeViewer(),
		tiles = deferred();
	const cleanup = await effect("basic/10/index.tsx", () =>
		Promise.resolve({
			initViewer: async (_, onCreated) => {
				onCreated(viewer);
				await tiles.promise;
			},
		}),
	);
	await flush();
	cleanup();
	assert.equal(viewer.isDestroyed(), true);
	tiles.resolve();
	await flush();
});

async function exportedFunction(path, name, dependencies) {
	const code = await source(path);
	const pattern = new RegExp(
		`(?:export )?(?:async )?function ${name}\\([^]*?\\n\\}`,
	);
	const match = code.match(pattern);
	assert.ok(match, name);
	const js = stripTypeScriptTypes(match[0].replace(/^export /, ""));
	return new Function(...Object.keys(dependencies), `${js}; return ${name};`)(
		...Object.values(dependencies),
	);
}
test("late 3D Tiles are disposed before touching a destroyed viewer", async () => {
	for (const [path, name] of [
		["basic/02/viewer.ts", "loadFiles"],
		["basic/11/viewer.ts", "loadPointInfo"],
	]) {
		const pending = deferred(),
			viewer = fakeViewer(),
			tiles = fakeViewer();
		const load = await exportedFunction(path, name, {
			Cesium3DTileset: { fromUrl: () => pending.promise },
		});
		const done = load(viewer);
		viewer.destroy();
		pending.resolve(tiles);
		await done;
		assert.equal(tiles.isDestroyed(), true);
	}
});
test("late CZML and SHP results never attach to a destroyed viewer", async () => {
	const pending = deferred(),
		viewer = fakeViewer();
	const load = await exportedFunction("basic/08/viewer.ts", "loadCZML", {
		CzmlDataSource: { load: () => pending.promise },
	});
	const done = load(viewer);
	viewer.destroy();
	pending.resolve({});
	await done;
	for (const stage of ["shp", "geojson"]) {
		const waiting = deferred(),
			target = fakeViewer();
		let attached = 0;
		target.dataSources = {
			add: () => {
				attached++;
			},
		};
		target.flyTo = () => Promise.resolve();
		const loadShp = await exportedFunction(
			"basic/05/viewer.ts",
			"loadShpFile",
			{
				window: { location: { origin: "http://localhost" } },
				shp: () => (stage === "shp" ? waiting.promise : Promise.resolve({})),
				GeoJsonDataSource: { load: () => waiting.promise },
				Color: { YELLOW: { withAlpha: () => ({}) } },
			},
		);
		const result = loadShp(target);
		await flush();
		target.destroy();
		waiting.resolve({});
		await result;
		assert.equal(attached, 0, stage);
	}
});

test("the shader initializer disposes late tiles and destroys its viewer on failure", async () => {
	for (const fails of [false, true]) {
		const pending = deferred();
		let created;
		class StubViewer {
			destroyed = false;
			scene = { imageryLayers: { add() {} } };
			imageryLayers = { get() {}, remove() {}, addImageryProvider() {} };
			cesiumWidget = { screenSpaceEventHandler: { removeInputAction() {} } };
			isDestroyed() {
				return this.destroyed;
			}
			destroy() {
				this.destroyed = true;
			}
		}
		class Provider {}
		const init = await exportedFunction("basic/10/viewer.ts", "initViewer", {
			Viewer: StubViewer,
			EllipsoidTerrainProvider: Provider,
			UrlTemplateImageryProvider: Provider,
			TencentImageryProvider: Provider,
			ImageryLayer: Provider,
			ScreenSpaceEventType,
			Cesium3DTileset: { fromUrl: () => pending.promise },
		});
		const result = init({}, (viewer) => {
			created = viewer;
		});
		assert.ok(created);
		if (fails) {
			pending.reject(new Error("tiles unavailable"));
			await assert.rejects(result, /tiles unavailable/);
		} else {
			created.destroy();
			const tiles = fakeViewer();
			pending.resolve(tiles);
			assert.equal(await result, undefined);
			assert.equal(tiles.isDestroyed(), true);
		}
		assert.equal(created.isDestroyed(), true);
	}
});

test("terrain and sunlight callbacks ignore results after viewer destruction", async () => {
	for (const number of ["01", "02", "03", "04"]) {
		const code = await source(`spatial-analysis/${number}/viewer.ts`);
		const match = code.match(
			/\.then\(\((terrainProvider|tileset)\) => \{([\s\S]*?)\n\t\t\}\)/,
		);
		assert.ok(match);
		const viewer = fakeViewer();
		viewer.destroy();
		const item = fakeViewer();
		const callback = new Function(
			"viewer",
			`return (${match[1]}) => {${match[2]}\n};`,
		)(viewer);
		callback(item);
		if (number === "02") assert.equal(item.isDestroyed(), true);
	}
});

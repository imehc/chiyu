import { geoMercator } from "d3-geo";
import gsap from "gsap";
import {
	AdditiveBlending,
	BoxGeometry,
	Color,
	Fog,
	Group,
	LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	MeshStandardMaterial,
	type Object3D,
	type Object3DEventMap,
	PointsMaterial,
	RepeatWrapping,
	Sprite,
	SpriteMaterial,
	type Texture,
	Vector3,
	type Vector3Like,
} from "three";
import { InteractionManager } from "three.interactive";
import labelIcon from "/texture/label-icon.png";
import type Assets from "../../shared/map/assets";
import type { MapWorldOptions } from "../../shared/map/map-3d";
import {
	createBarHalo,
	createGlowPillar,
	createRotationBorders,
} from "../../shared/map/scene/accents";
import {
	createMapDiffuse,
	createMapGrid,
	createMapOcean,
} from "../../shared/map/scene/background";
import { createMapEnvironment } from "../../shared/map/scene/environment";
import {
	createBarLabel,
	createMapLabels,
	createMonitoringLabel,
} from "../../shared/map/scene/labels";
import {
	populateMapFlyLines,
	populateMapScatter,
} from "../../shared/map/scene/layers";
import { createMapMaterials } from "../../shared/map/scene/materials";
import type { MapFocusLabelInfo as WorldMapFocusLabelInfo } from "../../shared/map/scene/types";
import { sortByValue } from "../../shared/map/utils/sort-by-value";
import WorldCore from "../../shared/map/world-core";
import BaseMap from "../../shared/map/world-core/components/base-map";
import ExtrudeMap from "../../shared/map/world-core/components/extrude-map";
import Focus from "../../shared/map/world-core/components/focus";
import Label3D, {
	type Label,
} from "../../shared/map/world-core/components/label-3d";
import Line from "../../shared/map/world-core/components/line";
import Particles from "../../shared/map/world-core/components/particles";
import GradientShader from "../../shared/map/world-core/shader/gradient-shader";
import infoData from "./data/info";
import labelData from "./data/labels";
import { chinaRegions } from "./data/regions";
import scatterData from "./data/scatter";

export type Point = [number, number];

const defaultMapFocusLabelInfo: WorldMapFocusLabelInfo = {
	name: "中国",
	enName: "PEOPLE'S REPUBLIC OF CHINA",
	center: [110, 15.5],
	// 英文全称明显长于中文，居中对齐才不会让「中国」偏到左侧
	align: "center",
};

/** 与广东大屏保持同一套场景比例，便于复用视觉参数。 */
export default class ChinaWorld extends WorldCore {
	private readonly _assets: Assets;
	private readonly _interactionManager: InteractionManager;

	private readonly _geoProjectionCenter: Point = [104.3, 35.7];
	private readonly _geoProjectionScale = 14;
	private readonly _flyLineCenter: Point = [116.405285, 39.904989];
	private readonly _depth = 0.5;
	private readonly _mapWidth = 15.05;
	private readonly _mapFocusLabelInfo = defaultMapFocusLabelInfo;
	private readonly _onPlayComplete?: () => void;

	private _labelGroup!: Group;
	private _label3d!: Label3D;
	private _flyLineFocusGroup!: Group;

	private _eventElement: Object3D[] = [];
	private _defaultMaterial: MeshStandardMaterial | null = null;
	private _defaultLightMaterial: MeshStandardMaterial | null = null;

	private _rotateBorder1: Mesh | null = null;
	private _rotateBorder2: Mesh | null = null;
	private _focusMapGroup: Group | null = null;
	private _focusMapTopMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	private _focusMapSideMaterial:
		| MeshLambertMaterial
		| MeshStandardMaterial
		| null = null;
	private _mapLineMaterial: LineBasicMaterial | null = null;
	private _barGroup: Group | null = null;
	private _allBar: Mesh[] = [];
	private _allBarMaterial: MeshBasicMaterial[] = [];
	private _allGuangquan: Group[] = [];
	private _allProvinceLabel: Label[] = [];
	private _otherLabel: Label[] = [];
	private _flyLineGroup: Group | null = null;
	private _particleGroup: Group | null = null;
	private _scatterGroup: Group | null = null;
	private _infoPointGroup: Group | null = null;
	private _infoLabelElement: Label[] = [];
	private _infoPointIndex = 0;
	private _clicked = false;
	private _animateTl: gsap.core.Timeline | null = null;
	private _infoPointLabelTime: ReturnType<typeof setInterval> | null = null;

	constructor(
		canvas: HTMLCanvasElement,
		assets: Assets,
		options: MapWorldOptions = {},
	) {
		super(canvas);
		this._assets = assets;
		this._onPlayComplete = options.onPlayComplete;
		this.scene.fog = new Fog(0x102736, 1, 50);
		this.scene.background = new Color(0x102736);
		this.camera.instance.position.set(
			-13.767695123014105,
			12.990152163077308,
			39.28228164159694,
		);
		this.camera.instance.near = 1;
		this.camera.instance.far = 10000;
		this.camera.instance.updateProjectionMatrix();
		this._interactionManager = new InteractionManager(
			this.renderer.instance,
			this.camera.instance,
			canvas,
		);
		this.initEnvironment();
		this.init();
	}

	get animateTl() {
		return this._animateTl as gsap.core.Timeline;
	}

	private init() {
		this._labelGroup = new Group();
		this._label3d = new Label3D({
			canvas: this.canvas,
			sizes: this.sizes,
			scene: this.scene,
			camera: this.camera,
			time: this.time,
		});
		this._labelGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._labelGroup);

		this._flyLineFocusGroup = new Group();
		this._flyLineFocusGroup.visible = false;
		this._flyLineFocusGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._flyLineFocusGroup);

		this._eventElement = [];
		this._defaultMaterial = null;
		this._defaultLightMaterial = null;

		this.createBottomBg();
		this.createGrid();
		this.createRotateBorder();
		this.createLabel();
		this.createMap();
		this.createEvent();
		this.createFlyLine();
		this.createFocus();
		this.createParticles();
		this.createScatter();
		this.createInfoPoint();
		this.createStorke();
		this.createAnimationTimeline();
	}

	private initEnvironment() {
		createMapEnvironment(this.scene);
	}

	private createMap() {
		const mapGroup = new Group();
		const focusMapGroup = new Group();
		this._focusMapGroup = focusMapGroup;
		const { surrounding, surroundingLine } = this.createSurrounding();
		const { map, mapTop, mapLine } = this.createProvince();
		surrounding.setParent(mapGroup);
		surroundingLine.setParent(mapGroup);
		this.createDiffuse();
		map.setParent(focusMapGroup);
		mapTop.setParent(focusMapGroup);
		mapLine.setParent(focusMapGroup);
		focusMapGroup.position.set(0, 0, -0.01);
		focusMapGroup.scale.set(1, 1, 0);
		mapGroup.add(focusMapGroup);
		mapGroup.rotation.x = -Math.PI / 2;
		mapGroup.position.set(0, 0.2, 0);
		this.scene.add(mapGroup);
		this.createBar();
	}

	/** 周边国家陆地背景，对应广东大屏的中国底图。 */
	private createSurrounding() {
		const params = {
			surroundingBgMaterialColor: "#1a3853",
			lineColor: "#3f82cd",
		};
		const surroundingData = this._assets.instance.getResource(
			"world",
		) as string;
		if (!surroundingData) {
			throw new Error("worldData is not found");
		}
		const surroundingBgMaterial = new MeshLambertMaterial({
			color: new Color(params.surroundingBgMaterialColor),
			transparent: true,
			opacity: 1,
		});
		const surrounding = new BaseMap(undefined, {
			data: surroundingData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			merge: true,
			material: surroundingBgMaterial,
			renderOrder: 2,
		});
		const surroundingTopLineMaterial = new LineBasicMaterial({
			color: params.lineColor,
			transparent: true,
			opacity: 0.62,
		});
		const surroundingLine = new Line(undefined, {
			data: surroundingData,
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			material: surroundingTopLineMaterial,
			renderOrder: 3,
		});
		surroundingLine.lineGroup.position.z += 0.01;
		return { surrounding, surroundingLine };
	}

	private createProvince() {
		const mapJsonData = this._assets.instance.getResource("mapJson") as string;
		if (!mapJsonData) {
			throw new Error("mapJsonData is not found");
		}
		const [topMaterial, sideMaterial] = this.createProvinceMaterial();
		this._focusMapTopMaterial = topMaterial;
		this._focusMapSideMaterial = sideMaterial;
		const map = new ExtrudeMap(
			{ assets: this._assets, time: this.time },
			{
				geoProjectionCenter: this._geoProjectionCenter,
				geoProjectionScale: this._geoProjectionScale,
				position: new Vector3(0, 0, 0.11),
				data: mapJsonData,
				depth: this._depth,
				topFaceMaterial: topMaterial,
				sideMaterial: sideMaterial,
				renderOrder: 9,
			},
		);
		const faceMaterial = new MeshStandardMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5,
		});
		new GradientShader(faceMaterial, {
			uColor1: 0x12bbe0,
			uColor2: 0x0094b5,
		});
		this._defaultMaterial = faceMaterial;
		this._defaultLightMaterial = this._defaultMaterial.clone();
		this._defaultLightMaterial.color = new Color("rgba(115,208,255,1)");
		this._defaultLightMaterial.opacity = 0.8;
		const mapTop = new BaseMap(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			position: new Vector3(0, 0, this._depth + 0.22),
			data: mapJsonData,
			material: faceMaterial,
			renderOrder: 2,
		});
		mapTop.mapGroup.children.forEach((group) => {
			group.children.forEach((mesh) => {
				if (mesh.type === "Mesh") {
					this._eventElement.push(mesh);
				}
			});
		});
		this._mapLineMaterial = new LineBasicMaterial({
			color: 0xffffff,
			opacity: 0,
			transparent: true,
			fog: false,
		});
		const mapLine = new Line(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			data: mapJsonData,
			material: this._mapLineMaterial,
			renderOrder: 3,
		});
		mapLine.lineGroup.position.z += this._depth + 0.23;
		return { map, mapTop, mapLine };
	}

	private createProvinceMaterial() {
		return createMapMaterials(
			this._assets,
			this.time,
			this._mapWidth.toFixed(2),
		);
	}

	/**
	 * 指标柱按区域分散选取。
	 * 柱标签与广东大屏同尺寸（约 156px 宽），因此省份之间需要足够的地理间距，
	 * 否则东部沿海与中部省份的标签会互相叠压。
	 */
	private getBarRegions() {
		const regionNames = [
			"广东省",
			"上海市",
			"四川省",
			"北京市",
			"新疆维吾尔自治区",
			"黑龙江省",
		];
		return sortByValue(
			chinaRegions.filter((item) => regionNames.includes(item.name)),
		);
	}

	private createBar() {
		const data = this.getBarRegions();
		const barGroup = new Group();
		this._barGroup = barGroup;
		const factor = 0.7;
		const height = 4.0 * factor;
		const max = data[0].value;
		this._allBar = [];
		this._allBarMaterial = [];
		this._allGuangquan = [];
		this._allProvinceLabel = [];
		data.forEach((item, index) => {
			const geoHeight = height * (item.value / max);
			const material = new MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				depthTest: false,
				fog: false,
			});
			new GradientShader(material, {
				uColor1: index > 3 ? 0xfbdf88 : 0x50bbfe,
				uColor2: index > 3 ? 0xfffef4 : 0x77fbf5,
				size: geoHeight,
				dir: "y",
			});
			const geo = new BoxGeometry(0.1 * factor, 0.1 * factor, geoHeight);
			geo.translate(0, 0, geoHeight / 2);
			const mesh = new Mesh(geo, material);
			mesh.renderOrder = 5;
			const areaBar = mesh;
			const [x, y] = this.geoProjection(item.centroid);
			areaBar.position.set(x, -y, this._depth + 0.45);
			areaBar.scale.set(1, 1, 0);
			areaBar.userData = { ...item };
			const guangQuan = this.createQuan(
				new Vector3(x, this._depth + 0.44, y),
				index,
			);
			const hg = this.createHUIGUANG(
				geoHeight,
				index > 3 ? 0xfffef4 : 0x77fbf5,
			);
			areaBar.add(...hg);
			barGroup.add(areaBar);
			barGroup.rotation.x = -Math.PI / 2;
			const barLabel = createBarLabel(
				{
					label3d: this._label3d,
					labelGroup: this._labelGroup,
					project: (point) => this.geoProjection(point),
				},
				{
					data: item,
					index,
					position: new Vector3(x, -y, this._depth + 1.1 + geoHeight),
					unit: "指数",
				},
			);
			this._allBar.push(areaBar);
			this._allBarMaterial.push(material);
			this._allGuangquan.push(guangQuan);
			this._allProvinceLabel.push(barLabel);
		});
		this.scene.add(barGroup);
	}

	private createEvent() {
		let objectsHover: Object3D[] = [];
		const reset = (mesh: Object3D) => {
			mesh.traverse((obj) => {
				if ("isMesh" in obj && obj.isMesh) {
					(obj as Mesh).material = this
						._defaultMaterial as MeshStandardMaterial;
				}
			});
		};
		const move = (mesh: Object3D) => {
			mesh.traverse((obj) => {
				if ("isMesh" in obj && obj.isMesh) {
					(obj as Mesh).material = this
						._defaultLightMaterial as MeshStandardMaterial;
				}
			});
		};
		this._eventElement.forEach((mesh) => {
			this._interactionManager.add(mesh);
			mesh.addEventListener("mousedown" as keyof Object3DEventMap, (ev) => {
				console.log(ev.target.userData.name);
			});
			mesh.addEventListener("mouseover" as keyof Object3DEventMap, (event) => {
				if (!objectsHover.includes(event.target.parent as Object3D)) {
					objectsHover.push(event.target.parent as Object3D);
				}
				document.body.style.cursor = "pointer";
				move(event.target.parent as Object3D);
			});
			mesh.addEventListener("mouseout" as keyof Object3DEventMap, (event) => {
				objectsHover = objectsHover.filter(
					(n) =>
						n.userData.name !== (event.target.parent as Object3D).userData.name,
				);
				reset(event.target.parent as Object3D);
				document.body.style.cursor = "default";
			});
		});
	}

	private createHUIGUANG(h: number, color: number) {
		return createGlowPillar(this._assets, h, color);
	}

	private createQuan(position: Vector3Like, _index: number) {
		const { group, rotatingMesh } = createBarHalo(this._assets, position);
		this.scene.add(group);
		this.time.on("tick", () => {
			rotatingMesh.rotation.z += 0.05;
		});
		return group;
	}

	private createDiffuse() {
		createMapDiffuse({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	private createGrid() {
		createMapGrid({ scene: this.scene, time: this.time, assets: this._assets });
	}

	private createBottomBg() {
		createMapOcean({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	private createLabel() {
		this._otherLabel = createMapLabels(
			{
				label3d: this._label3d,
				labelGroup: this._labelGroup,
				project: (point) => this.geoProjection(point),
			},
			labelData,
			this._mapFocusLabelInfo,
			[
				{
					icon: labelIcon,
					center: [124.5, 33.0],
					width: "40px",
					height: "40px",
					reflect: true,
				},
				{
					icon: labelIcon,
					center: [92.5, 40.0],
					width: "20px",
					height: "20px",
					reflect: false,
				},
			],
		);
	}

	private createRotateBorder() {
		[this._rotateBorder1, this._rotateBorder2] = createRotationBorders({
			scene: this.scene,
			time: this.time,
			assets: this._assets,
		});
	}

	private createFlyLine() {
		this._flyLineGroup = new Group();
		this._flyLineGroup.visible = false;
		this.scene.add(this._flyLineGroup);
		populateMapFlyLines(
			{
				assets: this._assets,
				group: this._flyLineGroup,
				project: (point) => this.geoProjection(point),
				depth: this._depth,
			},
			this.time,
			this._flyLineCenter,
			() => this.getBarRegions(),
		);
	}

	private createFocus() {
		const focusObj = new Focus(
			{ assets: this._assets },
			{ color1: 0xbdfdfd, color2: 0xbdfdfd },
		);
		const [x, y] = this.geoProjection(this._flyLineCenter);
		focusObj.position.set(x, -y, this._depth + 0.44);
		focusObj.scale.set(1, 1, 1);
		this._flyLineFocusGroup.add(focusObj);
	}

	private createParticles() {
		const particles = new Particles(
			{ time: this.time },
			{
				num: 10,
				range: 30,
				dir: "up",
				speed: 0.05,
				material: new PointsMaterial({
					map: Particles.createTexture(),
					size: 1,
					color: 0x00eeee,
					transparent: true,
					opacity: 1,
					depthTest: false,
					depthWrite: false,
					vertexColors: true,
					blending: AdditiveBlending,
					sizeAttenuation: true,
				}),
			},
		);
		this._particleGroup = new Group();
		this.scene.add(this._particleGroup);
		this._particleGroup.rotation.x = -Math.PI / 2;
		particles.setParent(this._particleGroup);
		particles.enable = true;
		this._particleGroup.visible = true;
	}

	private createScatter() {
		this._scatterGroup = new Group();
		this._scatterGroup.visible = false;
		this._scatterGroup.rotation.x = -Math.PI / 2;
		this.scene.add(this._scatterGroup);
		populateMapScatter(
			{
				assets: this._assets,
				group: this._scatterGroup,
				project: (point) => this.geoProjection(point),
				depth: this._depth,
			},
			() => sortByValue([...scatterData]),
		);
	}

	private createInfoPoint() {
		this._infoPointGroup = new Group();
		this.scene.add(this._infoPointGroup);
		this._infoPointGroup.visible = false;
		this._infoPointGroup.rotation.x = -Math.PI / 2;
		this._infoPointIndex = 0;
		this._infoPointLabelTime = null;
		this._infoLabelElement = [];
		const label3d = this._label3d;
		const texture = this._assets.instance.getResource("point") as Texture;
		if (!texture) {
			throw new Error("point texture not found");
		}
		const colors = [0xfffef4, 0x77fbf5];
		const infoAllData = sortByValue([...infoData]);
		const max = infoAllData[0].value;
		infoAllData.forEach((data, index) => {
			const material = new SpriteMaterial({
				map: texture,
				color: colors[index % colors.length],
				fog: false,
				transparent: true,
				depthTest: false,
			});
			const sprite = new Sprite(material);
			sprite.renderOrder = 23;
			const scale = 0.7 + (data.value / max) * 0.4;
			sprite.scale.set(scale, scale, scale);
			const [x, y] = this.geoProjection([data.lng, data.lat]);
			const position = [x, -y, this._depth + 0.7];
			sprite.position.set(position[0], position[1], position[2]);
			sprite.userData = {
				position: [...position],
				name: data.name,
				value: data.value,
				level: data.level,
				index: index,
			};
			this._infoPointGroup?.add(sprite);
			const label = createMonitoringLabel(
				{
					label3d,
					labelGroup: this._infoPointGroup as Group,
					project: (point) => this.geoProjection(point),
				},
				data,
				{
					depth: this._depth,
					verticalOffset: 3.6,
					valueLabel: "算力指数",
					valueUnit: "",
				},
			);
			this._infoLabelElement.push(label);
			this._interactionManager.add(sprite);
			sprite.addEventListener("mousedown" as keyof Object3DEventMap, (ev) => {
				if (this._clicked || !this._infoPointGroup?.visible) return false;
				this._clicked = true;
				this._infoPointIndex = ev.target.userData.index;
				this._infoLabelElement.forEach((label) => {
					label.visible = false;
				});
				label.visible = true;
				this.createInfoPointLabelLoop();
			});
			sprite.addEventListener("mouseup" as keyof Object3DEventMap, () => {
				this._clicked = false;
			});
			sprite.addEventListener("mouseover" as keyof Object3DEventMap, () => {
				document.body.style.cursor = "pointer";
			});
			sprite.addEventListener("mouseout" as keyof Object3DEventMap, () => {
				document.body.style.cursor = "default";
			});
		});
	}

	private createInfoPointLabelLoop() {
		clearInterval(this._infoPointLabelTime as number);
		this._infoPointLabelTime = setInterval(() => {
			this._infoPointIndex++;
			if (this._infoPointIndex >= this._infoLabelElement.length) {
				this._infoPointIndex = 0;
			}
			this._infoLabelElement.forEach((label, i) => {
				if (this._infoPointIndex === i) {
					label.visible = true;
				} else {
					label.visible = false;
				}
			});
		}, 3000);
	}

	private createStorke() {
		const mapStroke = this._assets.instance.getResource("mapStroke") as string;
		const texture = this._assets.instance.getResource("pathLine3") as Texture;
		if (!mapStroke || !texture) {
			throw new Error("mapStroke or pathLine3 texture not found");
		}
		texture.wrapS = texture.wrapT = RepeatWrapping;
		texture.repeat.set(2, 1);
		const pathLine = new Line(undefined, {
			geoProjectionCenter: this._geoProjectionCenter,
			geoProjectionScale: this._geoProjectionScale,
			position: new Vector3(0, 0, this._depth + 0.24),
			data: mapStroke,
			material: new MeshBasicMaterial({
				color: 0x2bc4dc,
				map: texture,
				alphaMap: texture,
				fog: false,
				transparent: true,
				opacity: 1,
				blending: AdditiveBlending,
			}),
			type: "Line3",
			renderOrder: 22,
			tubeRadius: 0.03,
			tubeSegments: 720,
		});
		this._focusMapGroup?.add(pathLine.lineGroup);
		this.time.on("tick", () => {
			texture.offset.x += 0.005;
		});
	}

	private createAnimationTimeline() {
		const tl = gsap.timeline({
			onComplete: () => {},
		});
		tl.pause();
		this._animateTl = tl;
		tl.addLabel("focusMap", 1.5);
		tl.addLabel("focusMapOpacity", 2);
		tl.addLabel("bar", 3);
		tl.to(this.camera.instance.position, {
			duration: 2,
			x: -0.17427287762525134,
			y: 13.678992786206543,
			z: 20.688611202093714,
			ease: "circ.out",
			onStart: () => {
				this._flyLineFocusGroup.visible = false;
			},
		});
		tl.to(
			(this._focusMapGroup as Group).position,
			{
				duration: 1,
				x: 0,
				y: 0,
				z: 0,
			},
			"focusMap",
		);
		tl.to(
			(this._focusMapGroup as Group).scale,
			{
				duration: 1,
				x: 1,
				y: 1,
				z: 1,
				ease: "circ.out",
				onComplete: () => {
					(this._flyLineGroup as Group).visible = true;
					(this._scatterGroup as Group).visible = true;
					(this._infoPointGroup as Group).visible = true;
					this.createInfoPointLabelLoop();
				},
			},
			"focusMap",
		);
		tl.to(
			this._focusMapTopMaterial,
			{
				duration: 1,
				opacity: 1,
				ease: "circ.out",
			},
			"focusMapOpacity",
		);
		tl.to(
			this._focusMapSideMaterial,
			{
				duration: 1,
				opacity: 1,
				ease: "circ.out",
				onComplete: () => {
					(
						this._focusMapSideMaterial as NonNullable<
							typeof this._focusMapSideMaterial
						>
					).transparent = false;
				},
			},
			"focusMapOpacity",
		);
		this._otherLabel.forEach((item, index) => {
			const element = item.element.querySelector("#other-label");
			tl.to(
				element,
				{
					duration: 1,
					delay: 0.1 * index,
					translateY: 0,
					opacity: 1,
					ease: "circ.out",
				},
				"focusMapOpacity",
			);
		});
		tl.to(
			this._mapLineMaterial,
			{
				duration: 0.5,
				delay: 0.3,
				opacity: 1,
			},
			"focusMapOpacity",
		);
		tl.to(
			(this._rotateBorder1 as NonNullable<typeof this._rotateBorder1>).scale,
			{
				delay: 0.3,
				duration: 1,
				x: 1,
				y: 1,
				z: 1,
				ease: "circ.out",
			},
			"focusMapOpacity",
		);
		tl.to(
			(this._rotateBorder2 as NonNullable<typeof this._rotateBorder2>).scale,
			{
				duration: 1,
				delay: 0.5,
				x: 1,
				y: 1,
				z: 1,
				ease: "circ.out",
				onComplete: () => {
					this._flyLineFocusGroup.visible = true;
					this._onPlayComplete?.();
				},
			},
			"focusMapOpacity",
		);
		this._allBar.forEach((item, index) => {
			tl.to(
				item.scale,
				{
					duration: 1,
					delay: 0.1 * index,
					x: 1,
					y: 1,
					z: 1,
					ease: "circ.out",
				},
				"bar",
			);
		});
		this._allBarMaterial.forEach((item, index) => {
			tl.to(
				item,
				{
					duration: 1,
					delay: 0.1 * index,
					opacity: 1,
					ease: "circ.out",
				},
				"bar",
			);
		});
		this._allProvinceLabel.forEach((item, index) => {
			const element = item.element.querySelector("#provinces-label-wrap");
			const number = item.element.querySelector(
				"#number #value",
			) as HTMLDivElement;
			const numberVal = Number(number.innerText);
			const numberAnimate = {
				score: 0,
			};
			tl.to(
				element,
				{
					duration: 1,
					delay: 0.2 * index,
					translateY: 0,
					opacity: 1,
					ease: "circ.out",
				},
				"bar",
			);
			tl.to(
				numberAnimate,
				{
					duration: 1,
					delay: 0.2 * index,
					score: numberVal,
					onUpdate: showScore,
				},
				"bar",
			);
			function showScore() {
				number.innerText = numberAnimate.score.toFixed(0);
			}
		});
		this._allGuangquan.forEach((item, index) => {
			tl.to(
				item.children[0].scale,
				{
					duration: 1,
					delay: 0.1 * index,
					x: 1,
					y: 1,
					z: 1,
					ease: "circ.out",
				},
				"bar",
			);
			tl.to(
				item.children[1].scale,
				{
					duration: 1,
					delay: 0.1 * index,
					x: 1,
					y: 1,
					z: 1,
					ease: "circ.out",
				},
				"bar",
			);
		});
	}

	private geoProjection(args: [number, number]) {
		return geoMercator()
			.center(this._geoProjectionCenter)
			.scale(this._geoProjectionScale)
			.translate([0, 0])(args) as [number, number];
	}

	update() {
		super.update();
		this._interactionManager?.update();
	}

	destroy() {
		if (this._infoPointLabelTime) {
			clearInterval(this._infoPointLabelTime);
			this._infoPointLabelTime = null;
		}
		this._animateTl?.kill();
		this._interactionManager.dispose();
		this._label3d.destroy();
		document.body.style.cursor = "default";
		super.destroy();
	}
}

import type { GUI } from "dat.gui";
import { gsap } from "gsap";
import { Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { setupModel } from "./setupModel";

const loadBirds = async (gui: GUI, isDisposed: () => boolean) => {
	const loader = new GLTFLoader();

	const parrotUrl = new URL("./assets/models/Parrot.glb", import.meta.url).href;
	const flamingoUrl = new URL("./assets/models/Flamingo.glb", import.meta.url)
		.href;
	const storkUrl = new URL("./assets/models/Stork.glb", import.meta.url).href;

	const [parrotData, flamingoData, storkData] = await Promise.all([
		loader.loadAsync(parrotUrl),
		loader.loadAsync(flamingoUrl),
		loader.loadAsync(storkUrl),
	]);
	if (isDisposed()) {
		for (const data of [parrotData, flamingoData, storkData]) {
			data.scene.traverse((object) => {
				if (!(object instanceof Mesh)) return;
				object.geometry.dispose();
				const materials = Array.isArray(object.material)
					? object.material
					: [object.material];
				for (const material of materials) material.dispose();
			});
		}
		return null;
	}

	const parrotOptions = {
		x: 0,
		y: 0,
		z: 2.5,
	};
	const flamingoOptions = {
		x: 7.5,
		y: 0,
		z: -10,
	};
	const storkOptions = {
		x: 0,
		y: -2.5,
		z: -10,
	};
	// ++++++++++++++++++++++++++++++ gui start ++++++++++++++++++++++++++++++
	const folder = gui.addFolder("鸟类位置参数");
	folder
		.add(parrotOptions, "x", -10, 10, 0.1)
		.name("鹦鹉X")
		.onChange((value: number) => {
			parrot.position.x = value;
		});
	folder
		.add(parrotOptions, "y", -10, 10, 0.1)
		.name("鹦鹉Y")
		.onChange((value: number) => {
			parrot.position.y = value;
		});
	folder
		.add(parrotOptions, "z", -10, 10, 0.1)
		.name("鹦鹉Z")
		.onChange((value: number) => {
			parrot.position.z = value;
		});
	folder
		.add(flamingoOptions, "x", -10, 10, 0.1)
		.name("火烈鸟X")
		.onChange((value: number) => {
			flamingo.position.x = value;
		});
	folder
		.add(flamingoOptions, "y", -10, 10, 0.1)
		.name("火烈鸟Y")
		.onChange((value: number) => {
			flamingo.position.y = value;
		});
	folder
		.add(flamingoOptions, "z", -10, 10, 0.1)
		.name("火烈鸟Z")
		.onChange((value: number) => {
			flamingo.position.z = value;
		});
	folder
		.add(storkOptions, "x", -10, 10, 0.1)
		.name("鹳X")
		.onChange((value: number) => {
			stork.position.x = value;
		});
	folder
		.add(storkOptions, "y", -10, 10, 0.1)
		.name("鹳Y")
		.onChange((value: number) => {
			stork.position.y = value;
		});
	folder
		.add(storkOptions, "z", -10, 10, 0.1)
		.name("鹳Z")
		.onChange((value: number) => {
			stork.position.z = value;
		});
	// gui.addColor()
	gui.show();
	// ++++++++++++++++++++++++++++++ gui end ++++++++++++++++++++++++++++++

	const parrot = setupModel(parrotData);
	parrot.position.set(parrotOptions.x, parrotOptions.y, parrotOptions.z);
	// console.log('Squaaawk!', parrotData);

	const flamingo = setupModel(flamingoData);
	flamingo.position.set(
		flamingoOptions.x,
		flamingoOptions.y,
		flamingoOptions.z,
	);

	const stork = setupModel(storkData);
	stork.position.set(storkOptions.x, storkOptions.y, storkOptions.z);

	// ++++++++++++++++++++++++++++++ gui start ++++++++++++++++++++++++++++++
	gui.add(stork, "visible").name("鹳是否显示");
	const options = {
		fn: () => {
			gsap.to(stork.position, {
				x: 3,
				duration: 3,
				repeat: 1,
				yoyo: true,
			});
		},
	};
	gui.add(options, "fn").name("鹳动画运动");
	// ++++++++++++++++++++++++++++++ gui end ++++++++++++++++++++++++++++++

	return {
		parrot,
		flamingo,
		stork,
	};
};

export { loadBirds };

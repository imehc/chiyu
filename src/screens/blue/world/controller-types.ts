import type WorldCamera from "./camera";
import type CameraMotion from "./camera-motion";
import type WorldFrame from "./frame";
import type WorldInteraction from "./interaction";
import type RegionNavigation from "./regions";
import type WorldResources from "./resources";
import type Subdivisions from "./subdivisions";
import type WorldView from "./view";

export interface WorldControllers {
	camera: WorldCamera;
	cameraMotion: CameraMotion;
	view: WorldView;
	regions: RegionNavigation;
	subdivisions: Subdivisions;
	interaction: WorldInteraction;
	frame: WorldFrame;
	resources: WorldResources;
}

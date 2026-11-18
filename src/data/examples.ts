export interface GalleryExample {
	id: string;
	title: string;
	href: string;
	description: string;
	technology: "Three.js" | "Canvas" | "Cesium";
	level: "基础" | "进阶" | "综合案例" | "空间分析";
}

export interface ExampleGalleryData {
	examples: GalleryExample[];
}

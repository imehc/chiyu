import {
	CanvasTexture,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	type Texture,
} from "three";

export default class SceneTextures {
	readonly disposable = new Set<Texture>();
	readonly shared = new Set<Texture>();
	private readonly glowTextures = new Map<string, Texture>();

	canvas(
		width: number,
		height: number,
		draw: (context: CanvasRenderingContext2D) => void,
	) {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (context) draw(context);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		this.disposable.add(texture);
		return texture;
	}

	sprite(
		text: string,
		options: {
			size?: number;
			color?: string;
			opacity?: number;
			width?: number;
			height?: number;
			bold?: boolean;
			plate?: boolean;
			simplePlate?: boolean;
		} = {},
	) {
		const width = options.width ?? 256;
		const height = options.height ?? 64;
		const texture = this.canvas(width * 2, height * 2, (context) => {
			context.scale(2, 2);
			if (options.plate) {
				context.fillStyle = options.simplePlate
					? "rgba(2,13,26,.84)"
					: "rgba(2,13,26,.90)";
				context.fillRect(8, 8, width - 16, height - 16);
				if (!options.simplePlate) {
					context.strokeStyle = "rgba(111,204,233,.55)";
					context.lineWidth = 2;
					context.strokeRect(8, 8, width - 16, height - 16);
					context.strokeStyle = "#baffff";
					context.strokeRect(22, height / 2 - 10, 22, 20);
					context.fillStyle = "#c9ffff";
					context.beginPath();
					context.moveTo(29, height / 2 + 5);
					context.lineTo(35, height / 2 - 5);
					context.lineTo(41, height / 2 + 5);
					context.fill();
				}
			}
			context.fillStyle = options.color ?? "#e8f9ff";
			context.textAlign = "center";
			context.textBaseline = "middle";
			const lines = text.split("\n");
			const size = options.size ?? 30;
			for (let i = 0; i < lines.length; i++) {
				context.font = `${options.simplePlate ? "600" : options.bold ? "900" : "500"} ${i === 1 ? size * 0.72 : size}px ${options.bold ? '"阿里妈妈数黑体 Bold",' : ""}"Alibaba PuHuiTi", "PingFang SC", sans-serif`;
				if (options.bold) {
					context.shadowColor = "#dcefff";
					context.shadowBlur = 4;
				}
				context.fillText(
					lines[i],
					width / 2 + (options.plate && !options.simplePlate ? 15 : 0),
					height / 2 + (i - (lines.length - 1) / 2) * size * 0.9,
				);
			}
		});
		return new Sprite(
			new SpriteMaterial({
				map: texture,
				transparent: true,
				opacity: options.opacity ?? 1,
				depthTest: false,
				depthWrite: false,
			}),
		);
	}

	glow(color = "#6de8ff") {
		const cached = this.glowTextures.get(color);
		if (cached) return cached;
		const texture = this.canvas(64, 64, (context) => {
			const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
			gradient.addColorStop(0, "#ffffff");
			gradient.addColorStop(0.1, color);
			gradient.addColorStop(0.26, `${color}a0`);
			gradient.addColorStop(0.55, `${color}25`);
			gradient.addColorStop(1, `${color}00`);
			context.fillStyle = gradient;
			context.fillRect(0, 0, 64, 64);
		});
		this.glowTextures.set(color, texture);
		this.shared.add(texture);
		return texture;
	}
}

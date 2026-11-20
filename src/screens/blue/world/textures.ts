/**
 * 贴图与精灵工厂：把 Canvas 2D 的绘制结果封装成 CanvasTexture 或 Sprite，
 * 并按用途登记到不同的集合，供场景销毁时统一释放显存。
 * 被 globe.ts、china.ts、labels.ts 等调用；自身只依赖 three，不感知业务。
 */
import {
	CanvasTexture,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	type Texture,
} from "three";

/**
 * Canvas 贴图工厂。
 * 一次性贴图与共享贴图分两个集合管理：前者随对象销毁，后者（光晕）按颜色缓存复用。
 */
export default class SceneTextures {
	/** 一次性贴图：每个对象独立生成，销毁时必须逐个 dispose */
	readonly disposable = new Set<Texture>();
	/** 共享贴图：同一颜色只生成一次，供多个 Sprite 复用，销毁时同样需要释放 */
	readonly shared = new Set<Texture>();
	/** 光晕纹理缓存，key 为颜色字符串，避免同色光晕重复绘制与上传 GPU */
	private readonly glowTextures = new Map<string, Texture>();

	/**
	 * 用 Canvas 2D 绘制并生成一张贴图。
	 * @param width 画布宽度（像素）
	 * @param height 画布高度（像素）
	 * @param draw 绘制回调，回调内可任意使用 2D 上下文
	 * @returns 已登记到 disposable 集合的贴图
	 */
	canvas(
		width: number,
		height: number,
		draw: (context: CanvasRenderingContext2D) => void,
	) {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		// 极少数环境拿不到 2d 上下文，此时保留空白贴图，不抛错中断整个场景构建
		if (context) draw(context);
		const texture = new CanvasTexture(canvas);
		// Canvas 颜色按 sRGB 解释，与渲染器的输出色彩空间保持一致，否则文字和线条会偏灰
		texture.colorSpace = SRGBColorSpace;
		this.disposable.add(texture);
		return texture;
	}

	/**
	 * 用文字生成一个面向镜头的 Sprite 铭牌。
	 * @param text 文本内容，含 \n 时按多行排版（第二行会自动缩小到 72%）
	 * @param options 尺寸、颜色、透明度与底板样式；width/height 为逻辑像素，默认 256×64
	 */
	sprite(
		text: string,
		options: {
			/** 字号（逻辑像素），默认 30 */
			size?: number;
			/** 文字颜色，默认浅青白 #e8f9ff */
			color?: string;
			/** 整体透明度，默认 1 */
			opacity?: number;
			/** 逻辑宽度，默认 256 */
			width?: number;
			/** 逻辑高度，默认 64 */
			height?: number;
			/** 是否加粗并带外发光阴影 */
			bold?: boolean;
			/** 是否绘制底板 */
			plate?: boolean;
			/** 简易底板：只填底色，不画边框与图标 */
			simplePlate?: boolean;
		} = {},
	) {
		const width = options.width ?? 256;
		const height = options.height ?? 64;
		// 按 2 倍尺寸绘制再交给 GPU 缩小采样，等价于超采样，文字边缘比 1 倍清晰得多
		const texture = this.canvas(width * 2, height * 2, (context) => {
			// scale(2,2) 之后回调内所有坐标仍按逻辑像素书写，无需手动乘 2
			context.scale(2, 2);
			if (options.plate) {
				// 简易底板只用近乎不透明的深蓝铺底；完整底板再加描边与左侧小图标
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
			// 第二行按 72% 字号缩小，用来做「中文主标题 + 英文副标题」的双语排版
			for (let i = 0; i < lines.length; i++) {
				context.font = `${options.simplePlate ? "600" : options.bold ? "900" : "500"} ${i === 1 ? size * 0.72 : size}px ${options.bold ? '"阿里妈妈数黑体 Bold",' : ""}"Alibaba PuHuiTi", "PingFang SC", sans-serif`;
				if (options.bold) {
					context.shadowColor = "#dcefff";
					context.shadowBlur = 4;
				}
				context.fillText(
					lines[i],
					// 带完整底板时文字右移 15px，给左侧的小图标让位
					width / 2 + (options.plate && !options.simplePlate ? 15 : 0),
					height / 2 + (i - (lines.length - 1) / 2) * size * 0.9,
				);
			}
		});
		// depthTest 关闭：铭牌始终绘制在场景之上，不会被地球或地图块遮住
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

	/**
	 * 获取（或按需生成）一张 64×64 的径向光晕贴图。
	 * @param color 光晕主色，默认 #6de8ff；同色只生成一次
	 * @returns 缓存中的共享贴图，调用方不得单独 dispose
	 */
	glow(color = "#6de8ff") {
		const cached = this.glowTextures.get(color);
		// 命中缓存直接返回，避免同色光晕反复绘制 canvas 并重复上传显存
		if (cached) return cached;
		const texture = this.canvas(64, 64, (context) => {
			// 从白心迅速过渡到带 alpha 后缀的主色，最后完全透明，形成常见的圆形光点
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
		// 同时登记到 shared：它既在缓存里，也在统一释放的名单里，销毁时不会被漏掉
		this.shared.add(texture);
		return texture;
	}
}

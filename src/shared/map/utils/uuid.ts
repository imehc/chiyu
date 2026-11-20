/**
 * 随机字符串生成工具，用于给 CSS3D 标签的容器生成唯一类名，
 * 避免多个标签渲染器的 DOM 样式互相覆盖（见 world-core/components/label-3d.ts）。
 */

/**
 * 生成一个随机的UUID字符串
 *
 * @param len - 生成UUID的长度，默认为10；传 0 时走标准 36 位 UUID 分支
 * @param radix - 使用的字符进制数，默认为62（使用数字+大小写字母）
 * @returns 生成的UUID字符串
 */
export function uuid(len = 10, radix = 62) {
	const chars =
		"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
	let uuid: string[] = [],
		i: number;
	// 设置实际使用的进制数
	radix = radix || chars.length;

	if (len) {
		// 根据指定长度生成随机字符串；0|x 是取整惯用法，等价于 Math.floor(x)
		for (i = 0; i < len; i++) uuid[i] = chars[0 | (Math.random() * radix)];
	} else {
		let r: number;
		// 设置UUID标准格式中的固定位置字符
		uuid[8] = uuid[13] = uuid[18] = uuid[23] = "-";
		uuid[14] = "4";
		// 生成标准UUID格式的字符串
		for (i = 0; i < 36; i++) {
			if (!uuid[i]) {
				r = 0 | (Math.random() * 16);
				// 对于第19位字符，应用特殊规则以满足UUID版本要求
				uuid[i] = chars[i === 19 ? (r & 0x3) | 0x8 : r];
			}
		}
	}

	return uuid.join("");
}

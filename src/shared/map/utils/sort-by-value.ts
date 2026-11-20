/**
 * 按 value 降序排序业务数组（原地排序并返回同一个引用）。
 * 被各屏 world 在渲染柱状图 / 散点前调用：排名标签与散点大小都以首项为最大值基准，故必须先排序。
 */
export function sortByValue<T extends { value: number }>(data: T[]) {
  // 原地 sort 会改变传入数组，调用方若还需原始顺序须自行复制
  data.sort((a, b) => b.value - a.value)
  return data
}
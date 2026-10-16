export interface WaterfallEntry<T> {
  item: T
  /** 列高估算（相对卡宽的比例：封面高/宽 + 卡身常数） */
  ratio: number
}

export interface WaterfallState<T> {
  columns: T[][]
  heights: number[]
}

const CARD_BODY_RATIO = 0.62

export function ratioOf(image?: { width: number; height: number }): number {
  return (image ? image.height / image.width : 1) + CARD_BODY_RATIO
}

/** 贪心分配到当前最矮列。传入 prev 增量追加：已有商品的列归属不会改变 */
export function waterfallAppend<T>(
  prev: WaterfallState<T> | null,
  entries: WaterfallEntry<T>[],
  columnCount: number,
): WaterfallState<T> {
  const columns: T[][] = prev
    ? prev.columns.map((col) => [...col])
    : Array.from({ length: columnCount }, () => [])
  const heights: number[] = prev ? [...prev.heights] : Array.from({ length: columnCount }, () => 0)

  for (const entry of entries) {
    let min = 0
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] < heights[min]) min = i
    }
    columns[min].push(entry.item)
    heights[min] += entry.ratio
  }
  return { columns, heights }
}

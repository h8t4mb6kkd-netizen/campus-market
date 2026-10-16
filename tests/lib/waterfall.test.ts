import { describe, expect, it } from 'vitest'
import { ratioOf, waterfallAppend } from '@/lib/waterfall'

const e = (id: string, ratio: number) => ({ item: id, ratio })

describe('waterfallAppend', () => {
  it('前几个商品依次落入各列（列高平衡）', () => {
    const { columns } = waterfallAppend(null, [e('a', 1), e('b', 1), e('c', 1), e('d', 1)], 3)
    expect(columns).toEqual([['a', 'd'], ['b'], ['c']])
  })

  it('矮列优先：高比例商品后的下一个进入最矮列', () => {
    const { columns } = waterfallAppend(null, [e('tall', 3), e('x', 1), e('y', 1)], 2)
    expect(columns).toEqual([['tall'], ['x', 'y']])
  })

  it('增量追加不移动已有商品', () => {
    const first = waterfallAppend(null, [e('a', 2), e('b', 1)], 2)
    const second = waterfallAppend(first, [e('c', 1)], 2)
    expect(second.columns[0][0]).toBe('a')
    expect(second.columns[1]).toEqual(['b', 'c'])
  })

  it('prev 列数与 columnCount 不一致时抛出明确错误（防误用）', () => {
    const first = waterfallAppend(null, [e('a', 1)], 2)
    expect(() => waterfallAppend(first, [e('b', 1)], 3)).toThrowError('waterfallAppend: columnCount 与 prev 的列数不一致')
  })

  it('ratioOf：无图回退 1:1 + 卡身常数', () => {
    expect(ratioOf(undefined)).toBeCloseTo(1.62)
    expect(ratioOf({ width: 800, height: 600 })).toBeCloseTo(0.75 + 0.62)
  })
})

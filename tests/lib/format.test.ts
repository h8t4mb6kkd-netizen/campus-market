import { describe, expect, it } from 'vitest'
import { formatPrice, formatRelativeTime } from '@/lib/format'

describe('formatPrice', () => {
  it.each([
    [1, '¥0.01'],
    [100, '¥1'],
    [1500, '¥15'],
    [1550, '¥15.5'],
    [1555, '¥15.55'],
    [9999900, '¥99999'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-16T12:00:00')
  it('1 分钟内 → 刚刚', () => {
    expect(formatRelativeTime(new Date('2026-10-16T11:59:40'), now)).toBe('刚刚')
  })
  it('1 小时内 → N分钟前', () => {
    expect(formatRelativeTime(new Date('2026-10-16T11:30:00'), now)).toBe('30分钟前')
  })
  it('今天更早 → N小时前', () => {
    expect(formatRelativeTime(new Date('2026-10-16T09:00:00'), now)).toBe('3小时前')
  })
  it('昨天 → 昨天 HH:mm', () => {
    expect(formatRelativeTime(new Date('2026-10-15T20:05:00'), now)).toBe('昨天 20:05')
  })
  it('同年更早 → MM-DD', () => {
    expect(formatRelativeTime(new Date('2026-09-01T08:00:00'), now)).toBe('09-01')
  })
  it('跨年 → YYYY-MM-DD', () => {
    expect(formatRelativeTime(new Date('2025-12-31T08:00:00'), now)).toBe('2025-12-31')
  })
})

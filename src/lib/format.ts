/** 以「分」为单位的整数 → 显示价：1500 → ¥15，1550 → ¥15.5，1555 → ¥15.55 */
export function formatPrice(cents: number): string {
  const yuan = cents / 100
  if (Number.isInteger(yuan)) return `¥${yuan}`
  return `¥${yuan.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / 昨天 HH:mm / MM-DD / YYYY-MM-DD */
export function formatRelativeTime(input: Date | number | string, now: Date | number = Date.now()): string {
  const d = new Date(input)
  const n = new Date(now)
  const diffMs = n.getTime() - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  if (diffMs < minute) return '刚刚'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`
  const startOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  if (d.getTime() >= startOfToday) return `${Math.floor(diffMs / hour)}小时前`
  const startOfYesterday = startOfToday - 24 * hour
  if (d.getTime() >= startOfYesterday) {
    return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() === n.getFullYear() ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`
}

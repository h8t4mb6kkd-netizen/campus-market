import { prisma } from '@/lib/db'

export interface DayCount {
  label: string // MM-DD
  value: number
}

export interface DashboardStats {
  userCount: number
  onSaleCount: number
  messageCount: number
  pendingVerifications: number
  pendingReports: number
  newItemsByDay: DayCount[]
  newUsersByDay: DayCount[]
}

function last7Days(): { label: string; start: Date; end: Date }[] {
  const days: { label: string; start: Date; end: Date }[] = []
  const now = new Date()
  for (let offset = 6; offset >= 0; offset -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const label = `${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    days.push({ label, start, end })
  }
  return days
}

export async function queryDashboardStats(): Promise<DashboardStats> {
  const days = last7Days()
  const weekStart = days[0].start

  const [userCount, onSaleCount, messageCount, pendingVerifications, pendingReports, weekItems, weekUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.item.count({ where: { status: 'ON_SALE' } }),
      prisma.message.count(),
      prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.item.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    ])

  const bucket = (dates: { createdAt: Date }[]): DayCount[] =>
    days.map((day) => ({
      label: day.label,
      value: dates.filter((d) => d.createdAt >= day.start && d.createdAt < day.end).length,
    }))

  return {
    userCount,
    onSaleCount,
    messageCount,
    pendingVerifications,
    pendingReports,
    newItemsByDay: bucket(weekItems),
    newUsersByDay: bucket(weekUsers),
  }
}

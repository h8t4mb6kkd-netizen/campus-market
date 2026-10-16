import { MiniBarChart } from '@/components/admin/MiniBarChart'
import { queryDashboardStats } from '@/lib/admin'

const CARDS = [
  { key: 'userCount', label: '用户总数' },
  { key: 'onSaleCount', label: '在售商品' },
  { key: 'messageCount', label: '消息总数' },
  { key: 'pendingVerifications', label: '待审核认证' },
  { key: 'pendingReports', label: '待处理举报' },
] as const

export default async function AdminDashboardPage() {
  const stats = await queryDashboardStats()
  return (
    <div>
      <h1 className="mb-5 text-xl font-extrabold">仪表盘</h1>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {CARDS.map((card) => (
          <div key={card.key} className="rounded-card bg-surface p-4 shadow-card">
            <p className="text-xs text-muted">{card.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-ink">{stats[card.key]}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart title="近 7 天新增商品" data={stats.newItemsByDay} />
        <MiniBarChart title="近 7 天新增用户" data={stats.newUsersByDay} />
      </div>
    </div>
  )
}

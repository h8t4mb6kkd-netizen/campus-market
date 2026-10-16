import type { ItemStatus } from '@/lib/constants'

export type ItemAction = 'RESERVE' | 'UNRESERVE' | 'MARK_SOLD' | 'DELIST' | 'RELIST'

export interface TransitionContext {
  actor: 'SELLER' | 'ADMIN' | 'OTHER'
  delistedBy?: string | null
}

/** 纯函数：返回 null 表示允许，返回字符串为拒绝原因。归属校验（是不是这个卖家）由调用方负责 */
export function canTransition(status: ItemStatus, action: ItemAction, ctx: TransitionContext): string | null {
  const isSeller = ctx.actor === 'SELLER'
  if (ctx.actor === 'OTHER') return '无权操作该商品'

  switch (action) {
    case 'RESERVE':
      return status === 'ON_SALE' && isSeller ? null : '只有卖家能把在售商品标记为已预订'
    case 'UNRESERVE':
      return status === 'RESERVED' && isSeller ? null : '只有卖家能取消预订'
    case 'MARK_SOLD':
      return (status === 'ON_SALE' || status === 'RESERVED') && isSeller
        ? null
        : '只有卖家能把在售 / 已预订商品标记为已售出'
    case 'DELIST':
      if (status === 'SOLD' || status === 'DELISTED') return '该商品不能下架'
      return null // 卖家与管理员都可下架
    case 'RELIST':
      if (status !== 'DELISTED') return '只有已下架商品能重新上架'
      if (!isSeller) return '只有卖家能重新上架'
      if (ctx.delistedBy === 'ADMIN') return '该商品被管理员下架，不能重新上架'
      return null
  }
}

export function applyTransition(status: ItemStatus, action: ItemAction): ItemStatus {
  switch (action) {
    case 'RESERVE': return 'RESERVED'
    case 'UNRESERVE': return 'ON_SALE'
    case 'MARK_SOLD': return 'SOLD'
    case 'DELIST': return 'DELISTED'
    case 'RELIST': return 'ON_SALE'
  }
}

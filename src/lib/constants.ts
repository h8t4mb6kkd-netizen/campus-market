// 域常量：一律字符串常量 + TS 联合类型（不用 Prisma enum，保证数据库双兼容）

export const CATEGORIES = [
  'BOOKS', 'DIGITAL', 'TRANSPORT', 'DORM', 'SPORTS', 'INSTRUMENTS', 'CLOTHING', 'OTHER',
] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABELS: Record<Category, string> = {
  BOOKS: '教材书籍', DIGITAL: '数码电子', TRANSPORT: '代步工具', DORM: '宿舍电器',
  SPORTS: '运动健身', INSTRUMENTS: '乐器', CLOTHING: '服饰', OTHER: '其他',
}

export const CONDITIONS = ['NEW', 'LIKE_NEW_99', 'LIKE_NEW_90', 'LIKE_NEW_80', 'FAIR'] as const
export type Condition = (typeof CONDITIONS)[number]
export const CONDITION_LABELS: Record<Condition, string> = {
  NEW: '全新', LIKE_NEW_99: '99新', LIKE_NEW_90: '9成新', LIKE_NEW_80: '8成新', FAIR: '7成新及以下',
}

export const ITEM_STATUS = ['ON_SALE', 'RESERVED', 'SOLD', 'DELISTED'] as const
export type ItemStatus = (typeof ITEM_STATUS)[number]
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  ON_SALE: '在售', RESERVED: '已预订', SOLD: '已售出', DELISTED: '已下架',
}

export const USER_ROLES = ['USER', 'ADMIN'] as const
export type UserRole = (typeof USER_ROLES)[number]
export const USER_STATUS = ['ACTIVE', 'BANNED'] as const
export type UserStatus = (typeof USER_STATUS)[number]

export const CONVERSATION_PAGE_SIZE = 20

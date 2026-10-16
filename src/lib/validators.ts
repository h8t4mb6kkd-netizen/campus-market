import { z } from 'zod'
import { CATEGORIES, CONDITIONS } from '@/lib/constants'

export const emailSchema = z.string().trim().toLowerCase().email('邮箱格式不正确')
export const passwordSchema = z.string().min(8, '密码至少 8 位').max(72, '密码最长 72 位') // bcrypt 上限 72 字节
export const usernameSchema = z.string().trim().min(2, '昵称至少 2 个字').max(20, '昵称最多 20 个字')

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码'),
})

const imageSchema = z.object({
  url: z.string().regex(/^\/uploads\/[\w./-]+$/, '图片地址不合法'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

// 表单价以「元」提交，落库前转「分」
const itemBaseSchema = z.object({
  title: z.string().trim().min(4, '标题至少 4 个字').max(60, '标题最多 60 个字'),
  description: z.string().trim().min(10, '描述至少 10 个字').max(2000, '描述最多 2000 字'),
  priceYuan: z.coerce.number({ message: '价格格式不正确' }).min(0.01, '价格不能低于 ¥0.01').max(99999, '价格不能超过 ¥99999'),
  negotiable: z.boolean().default(false),
  category: z.enum(CATEGORIES),
  condition: z.enum(CONDITIONS),
  location: z.string().trim().min(2, '交易地点至少 2 个字').max(40, '交易地点最多 40 个字'),
  images: z.array(imageSchema).min(1, '至少上传 1 张图片').max(9, '最多 9 张图片'),
})

export const itemSchema = itemBaseSchema

export interface ItemInput {
  title: string
  description: string
  priceCents: number
  negotiable: boolean
  category: string
  condition: string
  location: string
  images: { url: string; width: number; height: number }[]
}

export function parseItemInput(raw: unknown): ItemInput {
  const { priceYuan, ...rest } = itemBaseSchema.parse(raw)
  return { ...rest, priceCents: Math.round(priceYuan * 100) }
}

export const messageSendSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TEXT'),
    content: z.string().trim().min(1, '消息不能为空').max(2000, '消息最多 2000 字'),
    clientId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('IMAGE'),
    content: z.string().regex(/^\/uploads\/[\w./-]+$/, '图片地址不合法'),
    clientId: z.string().min(1).max(64),
  }),
])

export const commentSchema = z.object({
  content: z.string().trim().min(1, '留言不能为空').max(500, '留言最多 500 字'),
})

export const reviewSchema = z.object({
  rating: z.number().int().min(1, '请打分').max(5),
  content: z.string().trim().max(200, '评语最多 200 字').optional(),
})

export const reportSchema = z.object({
  targetType: z.enum(['ITEM', 'USER']),
  targetId: z.string().min(1),
  reason: z.string().trim().min(5, '理由至少 5 个字').max(500, '理由最多 500 字'),
})

export const verificationSchema = z.object({
  studentNo: z.string().trim().min(4, '学号至少 4 位').max(20, '学号最多 20 位'),
  proofImageUrl: z.string().regex(/^\/uploads\/[\w./-]+$/, '请上传学生证照片'),
})

export const verificationReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE') }),
  z.object({ action: z.literal('REJECT'), reason: z.string().trim().min(2, '请填写驳回理由').max(200) }),
])

export const createConversationSchema = z.object({
  itemId: z.string().min(1, '缺少商品'),
})

export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const userBanSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('BAN') }),
  z.object({ action: z.literal('UNBAN') }),
])

export const statusActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('RESERVE') }),
  z.object({ action: z.literal('UNRESERVE') }),
  z.object({ action: z.literal('DELIST') }),
  z.object({ action: z.literal('RELIST') }),
  z.object({ action: z.literal('MARK_SOLD'), buyerId: z.string().min(1, '请选择买家') }),
])

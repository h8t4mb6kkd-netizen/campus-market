import { describe, expect, it } from 'vitest'
import {
  commentSchema, itemSchema, loginSchema, messageSendSchema, paginationSchema,
  parseItemInput, registerSchema, reviewSchema, verificationReviewSchema,
} from '@/lib/validators'

const validItem = {
  title: '《数据结构》严蔚敏 九成新',
  description: '东区当面交易，无笔记，封面完好无损。',
  priceYuan: 15,
  negotiable: true,
  category: 'BOOKS',
  condition: 'LIKE_NEW_90',
  location: '东区3号楼',
  images: [{ url: '/uploads/2026/a.webp', width: 800, height: 600 }],
}

describe('registerSchema / loginSchema', () => {
  it('密码 7 位拒绝、8 位通过；邮箱非法拒绝', () => {
    expect(registerSchema.safeParse({ username: '小鹿', email: 'a@b.com', password: '1234567' }).success).toBe(false)
    expect(registerSchema.safeParse({ username: '小鹿', email: 'a@b.com', password: '12345678' }).success).toBe(true)
    expect(registerSchema.safeParse({ username: '小鹿', email: 'not-an-email', password: '12345678' }).success).toBe(false)
  })
  it('登录密码只要求非空（老规则变化不锁死用户）', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })
})

describe('itemSchema / parseItemInput', () => {
  it('价格边界：0.01 通过、0.009 拒绝、99999 通过、99999.01 拒绝', () => {
    expect(itemSchema.safeParse({ ...validItem, priceYuan: 0.01 }).success).toBe(true)
    expect(itemSchema.safeParse({ ...validItem, priceYuan: 0.009 }).success).toBe(false)
    expect(itemSchema.safeParse({ ...validItem, priceYuan: 99999 }).success).toBe(true)
    expect(itemSchema.safeParse({ ...validItem, priceYuan: 99999.01 }).success).toBe(false)
  })
  it('元 → 分精确转换（无浮点误差）', () => {
    expect(parseItemInput({ ...validItem, priceYuan: 0.29 }).priceCents).toBe(29)
    expect(parseItemInput({ ...validItem, priceYuan: 19.99 }).priceCents).toBe(1999)
    expect(parseItemInput({ ...validItem, priceYuan: 15 }).priceCents).toBe(1500)
  })
  it('标题 3 字拒绝 / 4 字通过 / 61 字拒绝', () => {
    expect(itemSchema.safeParse({ ...validItem, title: 'abc' }).success).toBe(false)
    expect(itemSchema.safeParse({ ...validItem, title: 'abcd' }).success).toBe(true)
    expect(itemSchema.safeParse({ ...validItem, title: 'x'.repeat(61) }).success).toBe(false)
  })
  it('图片 0 张拒绝、10 张拒绝', () => {
    expect(itemSchema.safeParse({ ...validItem, images: [] }).success).toBe(false)
    expect(itemSchema.safeParse({ ...validItem, images: Array(10).fill(validItem.images[0]) }).success).toBe(false)
  })
  it('未知分类拒绝', () => {
    expect(itemSchema.safeParse({ ...validItem, category: 'HACK' }).success).toBe(false)
  })
})

describe('messageSendSchema', () => {
  it('空文本拒绝、2000 字通过、2001 字拒绝', () => {
    const base = { type: 'TEXT' as const, clientId: 'c1' }
    expect(messageSendSchema.safeParse({ ...base, content: '  ' }).success).toBe(false)
    expect(messageSendSchema.safeParse({ ...base, content: 'x'.repeat(2000) }).success).toBe(true)
    expect(messageSendSchema.safeParse({ ...base, content: 'x'.repeat(2001) }).success).toBe(false)
  })
  it('图片消息必须是 /uploads/ 前缀', () => {
    expect(messageSendSchema.safeParse({ type: 'IMAGE', content: '/uploads/2026/a.webp', clientId: 'c1' }).success).toBe(true)
    expect(messageSendSchema.safeParse({ type: 'IMAGE', content: 'https://evil.com/a.png', clientId: 'c1' }).success).toBe(false)
  })
})

describe('其余 schema', () => {
  it('留言 500 字通过、501 拒绝、空拒绝', () => {
    expect(commentSchema.safeParse({ content: 'x'.repeat(500) }).success).toBe(true)
    expect(commentSchema.safeParse({ content: 'x'.repeat(501) }).success).toBe(false)
    expect(commentSchema.safeParse({ content: '' }).success).toBe(false)
  })
  it('评价 rating 1–5，评语可选且 ≤200 字', () => {
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false)
    expect(reviewSchema.safeParse({ rating: 5 }).success).toBe(true)
    expect(reviewSchema.safeParse({ rating: 3, content: 'x'.repeat(201) }).success).toBe(false)
  })
  it('认证驳回必须带理由', () => {
    expect(verificationReviewSchema.safeParse({ action: 'APPROVE' }).success).toBe(true)
    expect(verificationReviewSchema.safeParse({ action: 'REJECT' }).success).toBe(false)
    expect(verificationReviewSchema.safeParse({ action: 'REJECT', reason: '照片不清晰' }).success).toBe(true)
  })
  it('分页 limit 默认 20，0 与 51 拒绝，50 通过', () => {
    expect(paginationSchema.parse({}).limit).toBe(20)
    expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(paginationSchema.safeParse({ limit: 51 }).success).toBe(false)
    expect(paginationSchema.parse({ limit: 50 }).limit).toBe(50)
  })
})

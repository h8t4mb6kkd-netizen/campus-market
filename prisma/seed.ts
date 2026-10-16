// 演示数据脚本：幂等（每次先清空再重建），全部图片本地生成，不需要联网
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { generateAvatar, generateItemImage } from '../src/lib/seed-assets'
import { prisma } from '../src/lib/db'
import type { Category, Condition, ItemStatus } from '../src/lib/constants'

type SeededUser = Prisma.UserGetPayload<Record<string, never>>
type SeededItem = Prisma.ItemGetPayload<Record<string, never>>

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'seed')
const HOUR = 60 * 60 * 1000
const now = Date.now()

const USERS = [
  { username: '管理员', email: 'admin@campus.dev', role: 'ADMIN', verified: true, campus: null },
  { username: '小鹿', email: 'xiaolu@campus.dev', role: 'USER', verified: true, campus: '东区' },
  { username: '阿哲', email: 'azhe@campus.dev', role: 'USER', verified: true, campus: '西区' },
  { username: '桃子', email: 'taozi@campus.dev', role: 'USER', verified: false, campus: '南区' },
  { username: '豆豆', email: 'doudou@campus.dev', role: 'USER', verified: false, campus: '北区' },
] as const

interface ItemSeed {
  title: string
  priceYuan: number
  category: Category
  condition: Condition
  location: string
  negotiable: boolean
  seller: number // USERS 下标
  status?: ItemStatus
  buyer?: number
}

const ITEMS: ItemSeed[] = [
  { title: '《数据结构（C语言版）》严蔚敏 9成新', priceYuan: 15, category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区3号楼', negotiable: true, seller: 1 },
  { title: '《高等数学》同济七版 上下册', priceYuan: 20, category: 'BOOKS', condition: 'LIKE_NEW_80', location: '东区图书馆', negotiable: true, seller: 1 },
  { title: '考研英语一 历年真题（2010-2025）', priceYuan: 25, category: 'BOOKS', condition: 'LIKE_NEW_90', location: '北区宿舍', negotiable: false, seller: 4 },
  { title: '《计算机网络》自顶向下方法 第7版', priceYuan: 30, category: 'BOOKS', condition: 'LIKE_NEW_99', location: '西区4号楼', negotiable: true, seller: 2 },
  { title: '《线性代数》同济版 附习题全解', priceYuan: 10, category: 'BOOKS', condition: 'LIKE_NEW_80', location: '南区1号楼', negotiable: true, seller: 3 },
  { title: 'iPad 9代 64G WiFi版 带保护壳', priceYuan: 1250, category: 'DIGITAL', condition: 'LIKE_NEW_90', location: '西区宿舍', negotiable: true, seller: 2 },
  { title: '漫步者 W820NB 头戴降噪耳机', priceYuan: 220, category: 'DIGITAL', condition: 'LIKE_NEW_90', location: '东区3号楼', negotiable: true, seller: 1 },
  { title: '罗技 G304 无线游戏鼠标', priceYuan: 110, category: 'DIGITAL', condition: 'LIKE_NEW_80', location: '北区宿舍', negotiable: false, seller: 4 },
  { title: 'Kindle Paperwhite 4 8G 带原装壳', priceYuan: 380, category: 'DIGITAL', condition: 'LIKE_NEW_90', location: '南区2号楼', negotiable: true, seller: 3 },
  { title: '联想小新 65W 氮化镓充电器', priceYuan: 60, category: 'DIGITAL', condition: 'LIKE_NEW_99', location: '西区4号楼', negotiable: false, seller: 2 },
  { title: '捷安特 ATX 660 通勤山地车', priceYuan: 260, category: 'TRANSPORT', condition: 'LIKE_NEW_80', location: '西区车棚', negotiable: true, seller: 2, status: 'RESERVED' },
  { title: '迪卡侬 折叠自行车 20寸', priceYuan: 180, category: 'TRANSPORT', condition: 'LIKE_NEW_90', location: '东区车棚', negotiable: true, seller: 1 },
  { title: '九号电动滑板车 ES1', priceYuan: 450, category: 'TRANSPORT', condition: 'LIKE_NEW_80', location: '南区车棚', negotiable: true, seller: 3 },
  { title: '宿舍小冰箱 45L 一级能效', priceYuan: 80, category: 'DORM', condition: 'LIKE_NEW_90', location: '南区1号楼', negotiable: true, seller: 3 },
  { title: '小米台灯 Pro 护眼版', priceYuan: 70, category: 'DORM', condition: 'LIKE_NEW_90', location: '北区宿舍', negotiable: false, seller: 4 },
  { title: '宿舍吊椅 白色 承重200斤', priceYuan: 45, category: 'DORM', condition: 'LIKE_NEW_80', location: '东区3号楼', negotiable: true, seller: 1 },
  { title: '小天鹅迷你洗衣机 3kg', priceYuan: 200, category: 'DORM', condition: 'LIKE_NEW_80', location: '西区宿舍', negotiable: true, seller: 2 },
  { title: '雅马哈 F310 民谣吉他 带琴包', priceYuan: 350, category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '南区宿舍', negotiable: true, seller: 3 },
  { title: '卡西欧 CT-S300 电子琴 61键', priceYuan: 420, category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '北区宿舍', negotiable: true, seller: 4 },
  { title: '罗兰 FP-10 电钢琴 带琴架', priceYuan: 1600, category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '东区3号楼', negotiable: true, seller: 1 },
  { title: '尤克里里 23寸 单板 桃花芯', priceYuan: 130, category: 'INSTRUMENTS', condition: 'LIKE_NEW_99', location: '南区2号楼', negotiable: true, seller: 3 },
  { title: '迪卡侬瑜伽垫 183×61cm', priceYuan: 25, category: 'SPORTS', condition: 'LIKE_NEW_90', location: '北区宿舍', negotiable: false, seller: 4 },
  { title: '李宁羽毛球拍 碳素双拍套装', priceYuan: 90, category: 'SPORTS', condition: 'LIKE_NEW_80', location: '西区体育馆', negotiable: true, seller: 2 },
  { title: '迪卡侬 20kg 可调节哑铃一对', priceYuan: 120, category: 'SPORTS', condition: 'LIKE_NEW_80', location: '南区宿舍', negotiable: true, seller: 3 },
  { title: '捷安特骑行头盔 M码', priceYuan: 50, category: 'SPORTS', condition: 'LIKE_NEW_90', location: '西区车棚', negotiable: false, seller: 2 },
  { title: '优衣库轻型羽绒服 男 L码 藏青', priceYuan: 150, category: 'CLOTHING', condition: 'LIKE_NEW_90', location: '东区3号楼', negotiable: true, seller: 1 },
  { title: '耐克 Air Force 1 白色 42码', priceYuan: 320, category: 'CLOTHING', condition: 'LIKE_NEW_80', location: '北区宿舍', negotiable: true, seller: 4 },
  { title: '学院风双肩包 15.6寸 电脑位', priceYuan: 60, category: 'CLOTHING', condition: 'LIKE_NEW_99', location: '南区1号楼', negotiable: true, seller: 3 },
  { title: '冲锋衣 女 M码 三合一可拆', priceYuan: 180, category: 'CLOTHING', condition: 'LIKE_NEW_90', location: '西区4号楼', negotiable: true, seller: 2 },
  { title: '宜家小推车 三层 白色', priceYuan: 35, category: 'OTHER', condition: 'LIKE_NEW_90', location: '东区3号楼', negotiable: false, seller: 1 },
  { title: '多肉盆栽 含陶盆 共5盆', priceYuan: 30, category: 'OTHER', condition: 'NEW', location: '南区2号楼', negotiable: true, seller: 3 },
  { title: '得力 A4 打印纸 500张×5包', priceYuan: 40, category: 'OTHER', condition: 'NEW', location: '北区宿舍', negotiable: false, seller: 4, status: 'DELISTED' },
  { title: '航模入门 四轴无人机 带备件', priceYuan: 260, category: 'OTHER', condition: 'LIKE_NEW_80', location: '西区4号楼', negotiable: true, seller: 2 },
]

async function clearAll(): Promise<void> {
  await prisma.$transaction([
    prisma.report.deleteMany(),
    prisma.review.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.viewHistory.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.itemImage.deleteMany(),
    prisma.item.deleteMany(),
    prisma.verificationRequest.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ])
}

async function main(): Promise<void> {
  await rm(UPLOAD_DIR, { recursive: true, force: true })
  await mkdir(UPLOAD_DIR, { recursive: true })
  await clearAll()

  const passwordHash = await bcrypt.hash('demo1234', 10)
  const users: SeededUser[] = []
  for (const definition of USERS) {
    const avatarUrl = await generateAvatar(definition.username, UPLOAD_DIR)
    users.push(
      await prisma.user.create({
        data: {
          username: definition.username,
          email: definition.email,
          passwordHash,
          avatarUrl,
          role: definition.role,
          campus: definition.campus,
          verifiedAt: definition.verified ? new Date(now - 30 * 24 * HOUR) : null,
        },
      }),
    )
  }

  const items: SeededItem[] = []
  for (const [index, seed] of ITEMS.entries()) {
    const imageCount = (index % 3) + 1
    const images = []
    for (let i = 0; i < imageCount; i += 1) {
      images.push(await generateItemImage(seed.category, index * 10 + i, UPLOAD_DIR))
    }
    items.push(
      await prisma.item.create({
        data: {
          title: seed.title,
          description: `${seed.title}。${seed.location}当面交易，可先看货再决定，非诚勿扰。`,
          priceCents: Math.round(seed.priceYuan * 100),
          negotiable: seed.negotiable,
          category: seed.category,
          condition: seed.condition,
          location: seed.location,
          status: seed.status ?? 'ON_SALE',
          delistedBy: seed.status === 'DELISTED' ? 'USER' : null,
          sellerId: users[seed.seller].id,
          buyerId: seed.buyer !== undefined ? users[seed.buyer].id : null,
          soldAt: seed.status === 'SOLD' ? new Date(now - 2 * 24 * HOUR) : null,
          viewCount: 20 + ((index * 37) % 180),
          favoriteCount: (index * 13) % 9,
          createdAt: new Date(now - ((index * 5 + 2) % 160) * HOUR),
          images: { create: images.map((image, sort) => ({ url: image.url, width: image.width, height: image.height, sort })) },
        },
      }),
    )
  }

  // 两个已成交商品：改状态 + 双向评价（信誉分按聚合重算）
  const soldPlan: Array<{ itemIndex: number; buyer: number }> = [
    { itemIndex: 17, buyer: 2 }, // 吉他：桃子 卖给 阿哲
    { itemIndex: 13, buyer: 1 }, // 冰箱：桃子 卖给 小鹿
  ]
  for (const plan of soldPlan) {
    const item = items[plan.itemIndex]
    const buyer = users[plan.buyer]
    await prisma.item.update({
      where: { id: item.id },
      data: { status: 'SOLD', buyerId: buyer.id, soldAt: new Date(now - 48 * HOUR) },
    })
    await prisma.user.update({ where: { id: item.sellerId }, data: { soldCount: { increment: 1 } } })
    await prisma.review.create({
      data: { itemId: item.id, authorId: buyer.id, targetId: item.sellerId, rating: 5, content: '成色和描述一致，人很爽快！' },
    })
    await prisma.review.create({
      data: { itemId: item.id, authorId: item.sellerId, targetId: buyer.id, rating: 5, content: '准时守约，交易顺利。' },
    })
  }
  for (const user of users) {
    const aggregate = await prisma.review.aggregate({
      where: { targetId: user.id },
      _avg: { rating: true },
      _count: { _all: true },
    })
    await prisma.user.update({
      where: { id: user.id },
      data: { ratingAvg: aggregate._avg.rating ?? 0, ratingCount: aggregate._count._all },
    })
  }

  // 会话与消息（最后一条未读，红点可直接演示）
  const conversations: Array<{ itemIndex: number; buyer: number; messages: Array<[number, string]> }> = [
    { itemIndex: 10, buyer: 3, messages: [[3, '同学你好，自行车还在吗？'], [2, '在的，随时可以看车'], [3, '周末方便吗？我在南区'], [2, '周六下午两点西区车棚见？'], [3, '好的，到时候联系！']] },
    { itemIndex: 5, buyer: 1, messages: [[1, 'iPad 还在保修期吗？'], [2, '还剩两个月，发票也在'], [1, '能不能小刀一点，1200 出吗'], [2, '1220 吧，诚心要就成交']] },
    { itemIndex: 0, buyer: 4, messages: [[4, '这本书还有吗？里面笔记多不多'], [1, '有的，几乎没有笔记，很新']] },
  ]
  for (const plan of conversations) {
    const item = items[plan.itemIndex]
    const buyer = users[plan.buyer]
    const conversation = await prisma.conversation.create({
      data: { itemId: item.id, buyerId: buyer.id, sellerId: item.sellerId },
    })
    let lastAt = new Date(now - 6 * HOUR)
    for (const [senderIndex, content] of plan.messages) {
      lastAt = new Date(lastAt.getTime() + 11 * 60 * 1000)
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: users[senderIndex].id,
          type: 'TEXT',
          content,
          clientId: `seed-${conversation.id}-${content.length}-${lastAt.getTime()}`,
          createdAt: lastAt,
          readAt: null, // 全部未读：演示红点
        },
      })
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: lastAt, lastMessagePreview: plan.messages.at(-1)?.[1].slice(0, 60) ?? '' },
    })
  }

  // 收藏与浏览历史（小鹿）
  for (const [index, itemIndex] of [1, 8, 19].entries()) {
    await prisma.favorite.create({
      data: { userId: users[1].id, itemId: items[itemIndex].id, createdAt: new Date(now - (index + 1) * HOUR) },
    })
    await prisma.viewHistory.create({
      data: { userId: users[1].id, itemId: items[itemIndex].id, viewedAt: new Date(now - (index + 1) * HOUR) },
    })
  }

  // 待审核认证（桃子、豆豆）：用他们名下商品的第一张图充当学生证照片
  for (const userIndex of [3, 4]) {
    const ownItem = items.find((item) => item.sellerId === users[userIndex].id)
    const firstImage = ownItem
      ? await prisma.itemImage.findFirst({ where: { itemId: ownItem.id }, orderBy: { sort: 'asc' } })
      : null
    await prisma.verificationRequest.create({
      data: {
        userId: users[userIndex].id,
        studentNo: `2023${userIndex}0${userIndex}301`,
        proofImageUrl: firstImage?.url ?? '/uploads/seed/books-0.webp',
        createdAt: new Date(now - 5 * HOUR),
      },
    })
  }

  // 待处理举报
  await prisma.report.create({
    data: { reporterId: users[1].id, targetType: 'ITEM', targetId: items[31].id, reason: '商品信息与实际严重不符，描述是全新实际有明显使用痕迹', createdAt: new Date(now - 3 * HOUR) },
  })
  await prisma.report.create({
    data: { reporterId: users[2].id, targetType: 'USER', targetId: users[4].id, reason: '多次发送与商品无关的骚扰信息', createdAt: new Date(now - 2 * HOUR) },
  })

  console.log(`seed 完成：用户 ${await prisma.user.count()} · 商品 ${await prisma.item.count()} · 会话 ${await prisma.conversation.count()} · 消息 ${await prisma.message.count()}`)
  console.log('演示账号（密码都是 demo1234）：admin@campus.dev / xiaolu@campus.dev / azhe@campus.dev / taozi@campus.dev / doudou@campus.dev')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

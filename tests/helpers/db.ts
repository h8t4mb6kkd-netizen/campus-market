import { prisma } from '@/lib/db'

/** 清空所有业务表（外键依赖顺序：先子后父） */
export async function resetDb(): Promise<void> {
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

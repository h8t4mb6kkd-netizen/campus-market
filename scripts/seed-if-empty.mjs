import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const count = await prisma.user.count()
await prisma.$disconnect()

if (count === 0) {
  console.log('[boot] 空库 → 灌入演示数据')
  execSync('npx prisma db seed', { stdio: 'inherit' })
} else {
  console.log(`[boot] 已有 ${count} 个用户，跳过 seed`)
}

import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'

describe('seed 脚本', () => {
  it('可在测试库完整执行并生成演示数据（可重复执行）', async () => {
    const env = { ...process.env, DATABASE_URL: 'file:./test.db' }
    execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' })
    execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' }) // 幂等：再跑一遍不报错

    expect(await prisma.user.count()).toBe(5)
    expect(await prisma.item.count()).toBeGreaterThanOrEqual(30)
    expect(await prisma.conversation.count()).toBeGreaterThanOrEqual(3)
    expect(await prisma.message.count()).toBeGreaterThanOrEqual(10)
    expect(await prisma.review.count()).toBeGreaterThanOrEqual(4)
    expect(await prisma.verificationRequest.count({ where: { status: 'PENDING' } })).toBe(2)
    expect(await prisma.report.count({ where: { status: 'PENDING' } })).toBe(2)
    expect(await prisma.item.count({ where: { status: 'RESERVED' } })).toBeGreaterThanOrEqual(1)
    expect(await prisma.item.count({ where: { status: 'DELISTED' } })).toBeGreaterThanOrEqual(1)
  }, 180_000)
})

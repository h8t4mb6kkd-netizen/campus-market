import { execSync } from 'node:child_process'

const TEST_DATABASE_URL = 'file:./test.db' // 相对 prisma/ 解析 → prisma/test.db

export default function globalSetup(): void {
  // `--force-reset` 会触发 Prisma 针对 AI 代理的危险操作保护（本地 SQLite 测试库，
  // 非生产库）。此处显式声明项目负责人已在 Task 3 简报 Step 5 授权对测试库执行重置。
  execSync('npx prisma db push --skip-generate --force-reset', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
        'Task 3 brief Step 5 instructs tests/global-setup.ts to run prisma db push --force-reset against the local SQLite test database (prisma/test.db).',
    },
  })
}

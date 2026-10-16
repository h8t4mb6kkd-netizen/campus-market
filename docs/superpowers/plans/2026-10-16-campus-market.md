# 校园集市（CampusMarket）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个大学校园二手交易平台（注册/认证、商品发布与瀑布流浏览、实时聊天、收藏与评价、管理后台），作为可离线运行的作品集项目。

**Architecture:** Next.js（App Router，RSC + Route Handlers）跑在自定义 `server.ts` 上，Socket.IO 与 Next 同进程、共享 `lib/auth` 与 Prisma 数据层；开发用 SQLite，部署可切 PostgreSQL。实时消息先落库再广播，ack 回执 + 乐观渲染 + 断线增量拉取。

**Tech Stack:** Next.js（最新稳定版，App Router）+ TypeScript strict · Tailwind CSS v4 · Prisma + SQLite · Socket.IO · sharp · zod · Vitest（+ Testing Library）· npm · Node ≥ 20

**Spec:** `docs/superpowers/specs/2026-10-16-campus-market-design.md`（设计与验收依据；执行者需同时阅读）

## Global Constraints

（每个任务的要求都隐含包含本节；逐条照做）

1. **无 VPN 可用（硬性）**：运行时零外部请求——无 CDN、无 Google Fonts、无外部 API、无统计脚本；图标全部内联 SVG；字体用系统栈（`-apple-system, "Segoe UI", "Microsoft YaHei"`）；图片与头像全部本地生成/存储。README 附国内镜像加速说明。
2. **金额**：数据库一律整数「分」（`priceCents`，范围 1–9,999,900）；任何显示都走 `formatPrice`。
3. **枚举**：一律 `String` 字段 + TS 联合类型常量（不用 Prisma enum），保证 SQLite ↔ PostgreSQL 双兼容。
4. **认证**：bcrypt cost 10；session token 用 `crypto.randomBytes(32)` 生成，库里只存 SHA-256 哈希；Cookie 固定为 `httpOnly; SameSite=Lax; Path=/; Max-Age=2592000`（30 天），生产追加 `Secure`；登录失败统一文案「邮箱或密码错误」。
5. **校验与错误**：所有输入经 zod（schema 前后端共享于 `src/lib/validators.ts`）；API 错误统一 `{error:{code,message,fields?}}`，错误码仅限 `UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | VALIDATION | CONFLICT | INTERNAL`。
6. **CSRF**：所有写操作（POST/PATCH/DELETE）校验 `Origin` 与站点同源（缺失 Origin 时放行，浏览器同源请求可能不带）。
7. **界面**：简体中文；设计 token 用 Tailwind `@theme`（色板见 Spec §6）；禁止 `dangerouslySetInnerHTML`。
8. **平台**：Windows 11 + Git Bash；npm scripts 里设置环境变量必须用 `cross-env`（不可写 `NODE_ENV=x` 前缀，Windows 的 cmd 不支持）；后台进程用 `npm run dev > dev.log 2>&1 & echo $! > dev.pid` 启动、`taskkill //F //T //PID $(cat dev.pid)` 结束。
9. **测试**：Vitest；默认 `node` 环境，组件测试文件顶部加 `/** @vitest-environment jsdom */`；集成测试用独立数据库 `DATABASE_URL=file:./test.db`（解析为 `prisma/test.db`），每个测试文件 `beforeEach` 清库。
10. **提交**：每个 Task 最后一步提交（`feat: / fix: / test: / docs: / chore:` 前缀）；不要 push。

## Review Focus

以下 5 类是 Spec 隐含但容易漏的边界（各自归属任务内必须有对应测试，已在任务中标注）：

1. **并发/重复点击**：收藏双击（唯一约束冲突必须被吞掉并幂等返回，不能 500）、重复评价、重复提交认证申请。（归 Task 15 / 17 / 22）
2. **已售出 / 已下架商品的边角操作**：对 `SOLD` 商品编辑（应 403）、对 `SOLD` 商品发起**新**会话（应拒绝；已有会话可继续）、`delistedBy=ADMIN` 的商品卖家重新上架（应拒绝）。（归 Task 11 / 16 / 18）
3. **session 失效后的继续操作**：页面停留期间 session 过期 → API 返回 401，前端 Toast 提示并引导重新登录，不白屏、不静默失败。（归 Task 9）
4. **富文本注入**：留言/昵称/描述/举报理由中的 HTML 一律按纯文本渲染，测试用 `<img onerror>` 断言不执行。（归 Task 14）
5. **管理员自锁**：管理员封禁自己、审核自己的认证申请 → 服务端拒绝。（归 Task 22 / 25）

---

## 文件结构（先锁边界，再拆任务）

```
campus-market/
├─ server.ts                     自定义服务器：Next + Socket.IO 同进程
├─ prisma/
│  ├─ schema.prisma              12 张表（Spec §4）
│  ├─ seed.ts                    演示数据（sharp 本地生成占位图/头像，不联网）
│  ├─ dev.db                     （gitignore）
│  └─ test.db                    （gitignore）
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx              全局布局：顶栏 + Toast Provider
│  │  ├─ page.tsx                首页（瀑布流）
│  │  ├─ items/[id]/page.tsx     商品详情
│  │  ├─ publish/page.tsx        发布商品
│  │  ├─ chat/page.tsx           会话列表
│  │  ├─ chat/[id]/page.tsx      聊天窗
│  │  ├─ users/[id]/page.tsx     用户主页
│  │  ├─ me/page.tsx             个人中心（发布/收藏/历史/认证入口）
│  │  ├─ me/verification/page.tsx 学生认证提交
│  │  ├─ admin/                  后台：layout + page(仪表盘) + verifications + items + users + reports
│  │  ├─ login/page.tsx · register/page.tsx
│  │  ├─ icon.svg                站点图标（Next 自动作为 favicon，T28）
│  │  └─ api/                    health · auth/(register|login|logout) · items · items/[id] ·
│  │                             items/[id]/(favorite|comments|reviews|status) · upload ·
│  │                             conversations · conversations/[id]/messages · me/unread-count ·
│  │                             verifications · reports · admin/*
│  ├─ lib/
│  │  ├─ db.ts                   Prisma 单例
│  │  ├─ auth.ts                 hash/verify/createSession/validate/getSessionUser/requireUser/requireAdmin/cookie 构造
│  │  ├─ api.ts                  ApiError + errorResponse + readJson
│  │  ├─ origin.ts               Origin 同源校验
│  │  ├─ storage.ts              Storage 接口 + 本地磁盘实现
│  │  ├─ realtime.ts             Socket.IO：握手鉴权/房间/事件（attachRealtime 签名先冻结，Task 18 填实）
│  │  ├─ constants.ts            分类/成色/状态常量 + 中文映射（T4）
│  │  ├─ state-machine.ts        canTransition / applyTransition（T11）
│  │  ├─ validators.ts           zod schemas（前后端共享）
│  │  ├─ items.ts                商品查询与序列化（queryItems / toItemCardData，T12）
│  │  ├─ comments.ts             留言序列化（T14）
│  │  ├─ messages.ts             消息/会话序列化与未读统计（T18）
│  │  ├─ waterfall.ts            瀑布流分列纯函数（T13）
│  │  ├─ client-api.ts           useApi 客户端请求封装（T8）
│  │  ├─ admin.ts                后台统计查询（T24）
│  │  ├─ format.ts               formatPrice / formatRelativeTime
│  │  ├─ utils.ts                cn()
│  │  └─ seed-assets.ts          sharp 生成渐变占位图与几何头像（T26）
│  ├─ components/                ui/(Button,Input,Textarea,Badge,Skeleton,Toast,Avatar,EmptyState,Icon)
│  │                             layout/(SiteHeader,UnreadBadge) · item/(ItemCard,WaterfallFeed,CategoryChips,SortSelect)
│  │                             item-detail/(ImageCarousel,SellerCard,CommentSection,ReviewSection,FavoriteButton,ChatButton)
│  │                             chat/(ChatWindow,ConversationListLive) · auth/(LoginForm,RegisterForm)
│  │                             publish/PublishForm · me/(ItemStatusActions,LogoutButton,VerificationForm)
│  │                             report/ReportButton · admin/(MiniBarChart,AdminActionButton,RejectReasonButton)
│  └─ hooks/                     useSocket / useInfiniteItems
├─ tests/
│  ├─ setup.ts                   jest-dom 注册
│  ├─ global-setup.ts            db push 到 test.db
│  └─ helpers/                   db.ts(清库) · factory.ts(造数) · server.ts(起真实服务)
├─ public/uploads/               （gitignore，保留 .gitkeep）
└─ vitest.config.ts
```

**任务总览**（28 个 Task，7 个阶段）：
- 阶段 0 脚手架：T1 脚手架与测试基座 · T2 自定义服务器 + Socket.IO 挂载
- 阶段 1 数据与设计系统：T3 Prisma 数据层 · T4 zod validators · T5 设计系统与基础组件
- 阶段 2 认证：T6 认证核心库 · T7 认证 API · T8 登录/注册页面与登录态 · T9 封禁拦截 + Origin 校验 + 401 引导
- 阶段 3 商品闭环：T10 上传管线 · T11 发布与状态机 · T12 列表 API · T13 首页瀑布流 · T14 详情页与留言 · T15 收藏与浏览历史 · T16 发布页与我的发布 · T17 成交与评价 + 用户主页
- 阶段 4 实时聊天：T18 实时层服务端 · T19 聊天窗客户端（含图片消息）· T20 会话列表与未读 · T21 历史分页与断线增量
- 阶段 5 认证审核 + 举报 + 后台：T22 学生认证流程 · T23 举报 · T24 后台布局与仪表盘 · T25 后台管理页
- 阶段 6 收尾：T26 seed 演示数据 · T27 README（含镜像加速）· T28 验收清单 + 视觉打磨 + 无外部请求检查

---

## 阶段 0：脚手架

### Task 1: 脚手架与测试基座

**Files:**
- Create: create-next-app 生成的全部文件（`src/app/`、`next.config.ts`、`tsconfig.json` 等）
- Create: `vitest.config.ts`、`tests/setup.ts`
- Create: `src/lib/format.ts`、`src/lib/utils.ts`、`tests/lib/format.test.ts`
- Create: `public/uploads/.gitkeep`
- Modify: `.gitignore`（追加本地忽略项）、`package.json`（scripts）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `formatPrice(cents: number): string` —— 后续所有价格显示使用
  - `formatRelativeTime(input: Date | number | string, now?: Date | number): string`
  - `cn(...inputs: ClassValue[]): string`
  - npm scripts：`test` = `vitest run`、`test:watch` = `vitest`

- [ ] **Step 1: 清理会与脚手架冲突的文件并初始化**

```bash
cd "C:/Users/ZhuanZ/campus-market"
rm -f .gitignore        # 稍后用 create-next-app 生成的版本 + 追加重建（内容已进 git 历史）
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

预期：安装完成、无报错。（目录里已有的 `docs/`、`.git/`、`.superpowers/` 不冲突。）

- [ ] **Step 2: 验证脚手架可运行**

```bash
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 12
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000 | grep -o "Get started" | head -1
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：输出 `Get started`。

- [ ] **Step 3: 重建 .gitignore 与上传目录**

用 `Write` 在 `.gitignore` 末尾追加：

```gitignore
# local overrides
.superpowers/
public/uploads/*
!public/uploads/.gitkeep
```

```bash
mkdir -p public/uploads && touch public/uploads/.gitkeep
```

- [ ] **Step 4: 安装测试与工具依赖**

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react
npm i clsx tailwind-merge
```

- [ ] **Step 5: 写测试配置文件**

`vitest.config.ts`：

```ts
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
```

`tests/setup.ts`：

```ts
import '@testing-library/jest-dom/vitest'
```

`package.json` 的 `scripts` 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: 写失败的测试（TDD 起点）**

`tests/lib/format.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { formatPrice, formatRelativeTime } from '@/lib/format'

describe('formatPrice', () => {
  it.each([
    [1, '¥0.01'],
    [100, '¥1'],
    [1500, '¥15'],
    [1550, '¥15.5'],
    [1555, '¥15.55'],
    [9999900, '¥99999'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-16T12:00:00')
  it('1 分钟内 → 刚刚', () => {
    expect(formatRelativeTime(new Date('2026-10-16T11:59:40'), now)).toBe('刚刚')
  })
  it('1 小时内 → N分钟前', () => {
    expect(formatRelativeTime(new Date('2026-10-16T11:30:00'), now)).toBe('30分钟前')
  })
  it('今天更早 → N小时前', () => {
    expect(formatRelativeTime(new Date('2026-10-16T09:00:00'), now)).toBe('3小时前')
  })
  it('昨天 → 昨天 HH:mm', () => {
    expect(formatRelativeTime(new Date('2026-10-15T20:05:00'), now)).toBe('昨天 20:05')
  })
  it('同年更早 → MM-DD', () => {
    expect(formatRelativeTime(new Date('2026-09-01T08:00:00'), now)).toBe('09-01')
  })
  it('跨年 → YYYY-MM-DD', () => {
    expect(formatRelativeTime(new Date('2025-12-31T08:00:00'), now)).toBe('2025-12-31')
  })
})
```

- [ ] **Step 7: 运行测试确认失败**

```bash
npm test
```

预期：FAIL，报 `Cannot find module '@/lib/format'`（或同义错误）。

- [ ] **Step 8: 最小实现**

`src/lib/format.ts`：

```ts
/** 以「分」为单位的整数 → 显示价：1500 → ¥15，1550 → ¥15.5，1555 → ¥15.55 */
export function formatPrice(cents: number): string {
  const yuan = cents / 100
  if (Number.isInteger(yuan)) return `¥${yuan}`
  return `¥${yuan.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / 昨天 HH:mm / MM-DD / YYYY-MM-DD */
export function formatRelativeTime(input: Date | number | string, now: Date | number = Date.now()): string {
  const d = new Date(input)
  const n = new Date(now)
  const diffMs = n.getTime() - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  if (diffMs < minute) return '刚刚'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`
  const startOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  if (d.getTime() >= startOfToday) return `${Math.floor(diffMs / hour)}小时前`
  const startOfYesterday = startOfToday - 24 * hour
  if (d.getTime() >= startOfYesterday) {
    return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() === n.getFullYear() ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`
}
```

`src/lib/utils.ts`：

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 9: 运行测试确认通过**

```bash
npm test
```

预期：全部 PASS（9 条断言组）。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "chore: Next.js 脚手架 + Vitest 基座 + formatPrice/formatRelativeTime"
```

---

### Task 2: 自定义服务器（Next + Socket.IO 同进程）

**Files:**
- Create: `server.ts`、`src/lib/realtime.ts`（先冻结接口，Task 18 填实）
- Create: `src/app/api/health/route.ts`
- Modify: `package.json`（dev/build/start scripts）

**Interfaces:**
- Consumes: Task 1 的脚手架
- Produces:
  - `attachRealtime(io: SocketIOServer): void`（`src/lib/realtime.ts` 导出；Task 18 只改实现不改签名）
  - `GET /api/health` → `{ ok: true }`（Task 3 会扩展为含数据库检查）
  - scripts：`dev` = `cross-env NODE_ENV=development tsx watch server.ts`、`build` = `next build`、`start` = `cross-env NODE_ENV=production tsx server.ts`
  - 端口约定：`PORT` 环境变量，默认 3000；**绑定地址固定 `localhost`**（不要用 HOSTNAME 环境变量——Windows 的 Git Bash 会预设它为本机名）

- [ ] **Step 1: 安装依赖**

```bash
npm i socket.io
npm i -D tsx cross-env socket.io-client
```

- [ ] **Step 2: 写 server.ts**

```ts
// server.ts —— Next.js 与 Socket.IO 同进程的自定义服务器
import { createServer } from 'node:http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { attachRealtime } from './src/lib/realtime'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const hostname = 'localhost' // 注意：不要读 HOSTNAME 环境变量（Git Bash 会预设为本机名）

async function main(): Promise<void> {
  const app = next({ dev, hostname, port })
  await app.prepare()
  const handler = app.getRequestHandler()

  const httpServer = createServer((req, res) => {
    handler(req, res)
  })

  const io = new SocketIOServer(httpServer, { serveClient: false })
  attachRealtime(io)

  httpServer.listen(port, () => {
    console.log(`> 校园集市已启动: http://${hostname}:${port} (dev=${dev})`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

`src/lib/realtime.ts`（本任务仅实现连接日志，签名冻结）：

```ts
import type { Server as SocketIOServer } from 'socket.io'

/** 挂载实时层。签名冻结：Task 18 只改内部实现，不改此签名。 */
export function attachRealtime(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    console.log('[realtime] connected:', socket.id)
    socket.on('disconnect', (reason) => {
      console.log('[realtime] disconnected:', socket.id, reason)
    })
  })
}
```

`src/app/api/health/route.ts`：

```ts
import { NextResponse } from 'next/server'

export function GET(): NextResponse {
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 替换 package.json scripts**

把 `scripts` 改为（保留 `lint`）：

```json
"scripts": {
  "dev": "cross-env NODE_ENV=development tsx watch server.ts",
  "build": "next build",
  "start": "cross-env NODE_ENV=production tsx server.ts",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: 验证服务器与 Socket.IO 握手**

```bash
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000/api/health
echo
curl -s "http://localhost:3000/socket.io/?EIO=4&transport=polling" | head -c 120
echo
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：第一行 `{"ok":true}`；第二行以 `0{"sid":` 开头（Socket.IO 握手成功）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 自定义服务器 —— Next.js 与 Socket.IO 同进程，含 /api/health"
```

## 阶段 1：数据与设计系统

### Task 3: Prisma 数据层（12 张表）

**Files:**
- Create: `prisma/schema.prisma`（全量替换 `prisma init` 的产物）、`src/lib/db.ts`
- Create: `tests/global-setup.ts`、`tests/helpers/db.ts`、`tests/db/schema.test.ts`、`tests/api/health.test.ts`
- Create: `.env.example`
- Modify: `vitest.config.ts`（globalSetup + env）、`src/app/api/health/route.ts`（加数据库检查）、`package.json`（db scripts）

**Interfaces:**
- Consumes: Task 2 的 `/api/health`
- Produces:
  - `prisma`（`src/lib/db.ts` 导出的 PrismaClient 单例）
  - 全部 12 个模型（Prisma Client 生成的类型，后续任务直接 `prisma.user` / `prisma.item` 等）
  - `resetDb(): Promise<void>`（`tests/helpers/db.ts`，集成测试的 `beforeEach` 用）
  - `GET /api/health` → `{ ok: true, db: 'up' }`（数据库不可达时 500 `{ok:false,db:'down'}`）
  - （package.json 的 `db:migrate` / `db:seed` / `setup` / `prisma.seed` 配置统一在 T26 Step 1 补齐）

- [ ] **Step 1: 安装 Prisma 并初始化**

```bash
npm i @prisma/client
npm i -D prisma
npx prisma init --datasource-provider sqlite
```

`prisma init` 会生成 `prisma/schema.prisma` 与 `.env`（含 `DATABASE_URL="file:./dev.db"`）。创建 `.env.example`：

```bash
# 复制一份 .env 模板（.env 本身已被 gitignore）
printf 'DATABASE_URL="file:./dev.db"\n' > .env.example
```

- [ ] **Step 2: 写完整 schema.prisma**

用以下内容**全量替换** `prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// 注意：枚举一律 String + 应用层 TS 联合类型（constants.ts），保证 SQLite/PG 双兼容

model User {
  id           String    @id @default(cuid())
  username     String    @unique
  email        String    @unique
  passwordHash String
  avatarUrl    String?
  role         String    @default("USER") // USER | ADMIN
  status       String    @default("ACTIVE") // ACTIVE | BANNED
  campus       String?
  verifiedAt   DateTime?
  ratingAvg    Float     @default(0)
  ratingCount  Int       @default(0)
  soldCount    Int       @default(0)
  createdAt    DateTime  @default(now())

  sessions             Session[]
  verificationRequests VerificationRequest[]
  items                Item[]              @relation("ItemSeller")
  boughtItems          Item[]              @relation("ItemBuyer")
  conversationsAsBuyer  Conversation[]     @relation("ConvBuyer")
  conversationsAsSeller Conversation[]     @relation("ConvSeller")
  messages             Message[]
  favorites            Favorite[]
  viewHistory          ViewHistory[]
  comments             Comment[]
  reviewsWritten       Review[]            @relation("ReviewAuthor")
  reviewsReceived      Review[]            @relation("ReviewTarget")
  reports              Report[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
}

model VerificationRequest {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  studentNo     String
  proofImageUrl String
  status        String    @default("PENDING") // PENDING | APPROVED | REJECTED
  rejectReason  String?
  createdAt     DateTime  @default(now())
  reviewedAt    DateTime?

  @@index([status, createdAt])
}

model Item {
  id            String    @id @default(cuid())
  title         String
  description   String
  priceCents    Int
  negotiable    Boolean   @default(false)
  category      String
  condition     String
  location      String
  status        String    @default("ON_SALE") // ON_SALE | RESERVED | SOLD | DELISTED
  delistedBy    String? // USER | ADMIN（仅 DELISTED 时有值）
  sellerId      String
  seller        User      @relation("ItemSeller", fields: [sellerId], references: [id])
  buyerId       String?
  buyer         User?     @relation("ItemBuyer", fields: [buyerId], references: [id])
  viewCount     Int       @default(0)
  favoriteCount Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  soldAt        DateTime?

  images        ItemImage[]
  conversations Conversation[]
  comments      Comment[]
  reviews       Review[]

  @@index([status, createdAt])
  @@index([sellerId])
  @@index([category, status])
}

model ItemImage {
  id     String @id @default(cuid())
  itemId String
  item   Item   @relation(fields: [itemId], references: [id], onDelete: Cascade)
  url    String
  width  Int
  height Int
  sort   Int    @default(0)

  @@index([itemId])
}

model Conversation {
  id                 String   @id @default(cuid())
  itemId             String
  item               Item     @relation(fields: [itemId], references: [id])
  buyerId            String
  buyer              User     @relation("ConvBuyer", fields: [buyerId], references: [id])
  sellerId           String
  seller             User     @relation("ConvSeller", fields: [sellerId], references: [id])
  lastMessageAt      DateTime @default(now())
  lastMessagePreview String   @default("")
  createdAt          DateTime @default(now())

  messages Message[]

  @@unique([itemId, buyerId])
  @@index([sellerId, lastMessageAt])
  @@index([buyerId, lastMessageAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id])
  type           String       @default("TEXT") // TEXT | IMAGE
  content        String
  clientId       String? // 幂等标识，与 conversationId 联合唯一
  readAt         DateTime?
  createdAt      DateTime     @default(now())

  @@unique([conversationId, clientId])
  @@index([conversationId, createdAt])
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  itemId    String
  item      Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, itemId])
}

model ViewHistory {
  id       String   @id @default(cuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  itemId   String
  item     Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  viewedAt DateTime @default(now())

  @@unique([userId, itemId])
  @@index([userId, viewedAt])
}

model Comment {
  id        String   @id @default(cuid())
  itemId    String
  item      Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  content   String
  createdAt DateTime @default(now())

  @@index([itemId, createdAt])
}

model Review {
  id        String   @id @default(cuid())
  itemId    String
  item      Item     @relation(fields: [itemId], references: [id])
  authorId  String
  author    User     @relation("ReviewAuthor", fields: [authorId], references: [id])
  targetId  String
  target    User     @relation("ReviewTarget", fields: [targetId], references: [id])
  rating    Int
  content   String?
  createdAt DateTime @default(now())

  @@unique([itemId, authorId])
  @@index([targetId])
}

model Report {
  id         String    @id @default(cuid())
  reporterId String
  reporter   User      @relation(fields: [reporterId], references: [id])
  targetType String // ITEM | USER
  targetId   String
  reason     String
  status     String    @default("PENDING") // PENDING | RESOLVED | DISMISSED
  createdAt  DateTime  @default(now())
  handledAt  DateTime?

  @@index([status, createdAt])
}
```

- [ ] **Step 3: 迁移并生成客户端**

```bash
npx prisma migrate dev --name init
```

预期：生成 `prisma/migrations/…_init/`、`prisma/dev.db`，并成功生成 Prisma Client。

- [ ] **Step 4: 写 Prisma 单例**

`src/lib/db.ts`：

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 5: 配置测试库与清库助手**

`vitest.config.ts` 的 `test` 块加三行（SQLite 是单文件数据库，**测试文件必须串行执行**）：

```ts
    globalSetup: ['./tests/global-setup.ts'],
    env: { DATABASE_URL: 'file:./test.db' },
    fileParallelism: false,
```

`tests/global-setup.ts`：

```ts
import { execSync } from 'node:child_process'

const TEST_DATABASE_URL = 'file:./test.db' // 相对 prisma/ 解析 → prisma/test.db

export default function globalSetup(): void {
  execSync('npx prisma db push --skip-generate --force-reset', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  })
}
```

`tests/helpers/db.ts`：

```ts
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
```

在 `.gitignore` 追加：

```gitignore
prisma/dev.db
prisma/test.db
prisma/dev.db-journal
prisma/test.db-journal
```

- [ ] **Step 6: 写失败的测试**

`tests/db/schema.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'

describe('数据层冒烟', () => {
  beforeEach(resetDb)

  it('创建用户与商品并关联，默认状态为 ON_SALE', async () => {
    const u = await prisma.user.create({
      data: { username: '小鹿', email: 'lu@campus.dev', passwordHash: 'h' },
    })
    const item = await prisma.item.create({
      data: {
        title: '《数据结构》严蔚敏',
        description: '九成新，无笔记',
        priceCents: 1500,
        category: 'BOOKS',
        condition: 'LIKE_NEW_90',
        location: '东区3号楼',
        sellerId: u.id,
      },
    })
    const found = await prisma.item.findUnique({ where: { id: item.id }, include: { seller: true } })
    expect(found?.seller.username).toBe('小鹿')
    expect(found?.status).toBe('ON_SALE')
  })

  it('会话唯一约束 (itemId, buyerId) 生效', async () => {
    const seller = await prisma.user.create({ data: { username: 's', email: 's@a.com', passwordHash: 'h' } })
    const buyer = await prisma.user.create({ data: { username: 'b', email: 'b@a.com', passwordHash: 'h' } })
    const item = await prisma.item.create({
      data: { title: 't', description: 'd', priceCents: 100, category: 'DIGITAL', condition: 'LIKE_NEW_99', location: 'L', sellerId: seller.id },
    })
    await prisma.conversation.create({ data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id } })
    await expect(
      prisma.conversation.create({ data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id } }),
    ).rejects.toThrow()
  })
})
```

`tests/api/health.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('返回 ok 且数据库可达', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'up' })
  })
})
```

- [ ] **Step 7: 运行确认失败**

```bash
npm test
```

预期：FAIL——`src/lib/db.ts` 尚未导出（或 health 返回 `{ok:true}` 与断言不符）。

- [ ] **Step 8: 实现**

`src/lib/db.ts` 已在 Step 4 写好。更新 `src/app/api/health/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: 'up' })
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 500 })
  }
}
```

- [ ] **Step 9: 运行确认通过**

```bash
npm test
```

预期：`tests/db/schema.test.ts` 2 条 + `tests/api/health.test.ts` 1 条 + Task 1 的 format 测试全 PASS。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "feat: Prisma 数据层 12 张表 + 测试库基建 + health 数据库检查"
```

---

### Task 4: zod validators（前后端共享 schema）

**Files:**
- Create: `src/lib/constants.ts`、`src/lib/validators.ts`、`tests/lib/validators.test.ts`

**Interfaces:**
- Consumes: 无（纯 TS，不依赖 Prisma）
- Produces（后续任务的字段名与类型必须一致）：
  - `src/lib/constants.ts`：`CATEGORIES`（8 个英文常量元组）、`CONDITIONS`（5 个）、`ITEM_STATUS`（4 个）、`CATEGORY_LABELS` / `CONDITION_LABELS` / `ITEM_STATUS_LABELS`（中文显示名映射）
  - `src/lib/validators.ts`：
    - `registerSchema` → `{ username, email, password }`
    - `loginSchema` → `{ email, password }`
    - `itemSchema`（输入含 `priceYuan: number`）→ `parseItemInput(raw)` 返回去掉 `priceYuan`、含 `priceCents: number` 的对象
    - `messageSendSchema` → 判别联合 `{ type:'TEXT', content, clientId } | { type:'IMAGE', content, clientId }`
    - `commentSchema` → `{ content }`
    - `reviewSchema` → `{ rating: number, content?: string }`
    - `reportSchema` → `{ targetType: 'ITEM'|'USER', targetId, reason }`
    - `verificationSchema` → `{ studentNo, proofImageUrl }`
    - `verificationReviewSchema` → `{ action: 'APPROVE' } | { action: 'REJECT', reason: string }`
    - `paginationSchema` → `{ cursor?: string, limit: number }`（默认 20，1–50）

- [ ] **Step 1: 安装 zod**

```bash
npm i zod
```

- [ ] **Step 2: 写失败的测试**

`tests/lib/validators.test.ts`：

```ts
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
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test
```

预期：FAIL，`Cannot find module '@/lib/validators'`。

- [ ] **Step 4: 实现 constants.ts**

```ts
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
```

- [ ] **Step 5: 实现 validators.ts**

```ts
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

export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
```

- [ ] **Step 6: 运行确认通过**

```bash
npm test
```

预期：validators 测试全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: zod validators 全量 + 域常量（分类/成色/状态中文映射）"
```

### Task 5: 设计系统与基础组件

**Files:**
- Modify: `src/app/globals.css`（**全量替换**，去掉脚手架默认的暗色媒体查询）
- Modify: `src/app/layout.tsx`
- Create: `src/components/layout/SiteHeader.tsx`
- Create: `src/components/ui/Icon.tsx` · `Button.tsx` · `Badge.tsx` · `Avatar.tsx` · `Skeleton.tsx` · `EmptyState.tsx` · `Toast.tsx`
- Test: `tests/components/ui.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `ITEM_STATUS_LABELS`、`cn`（Task 1）
- Produces（后续所有 UI 任务依赖这些组件的确切 props）：
  - `Icon({ name, size?, className? })`，name 联合类型见下（20 个内联 SVG，零外部依赖）
  - `Button({ variant?: 'primary'|'secondary'|'ghost'|'danger', loading?, ...buttonProps })`
  - `StatusBadge({ status: ItemStatus })` → 中文状态徽标
  - `Avatar({ src?: string|null, name: string, size?: number })` → 无图时按名字生成彩色首字头像
  - `Skeleton({ className? })`
  - `EmptyState({ title, description?, action?, iconName? })`
  - `ToastProvider` + `useToast()` → `{ success(msg), error(msg) }`（3 秒自动消失）
  - `SiteHeader({ user })`，`user: { username, avatarUrl, unreadCount } | null`（T8 传入真实登录态；T5 先传 null）

- [ ] **Step 1: 全量替换 globals.css**

```css
@import "tailwindcss";

@theme {
  --color-bg: #f5f8fb;
  --color-surface: #ffffff;
  --color-brand: #0fa47f;
  --color-brand-deep: #0b7d60;
  --color-price: #ff5a3c;
  --color-ink: #2b3440;
  --color-muted: #7c8aa0;
  --color-line: #e3eaf2;
  --shadow-card: 0 2px 8px rgba(20, 40, 80, 0.07);
  --radius-card: 12px;
  --radius-btn: 8px;
}

html { color-scheme: light; }

body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, "PingFang SC", sans-serif;
}
```

- [ ] **Step 2: 写 Icon.tsx（20 个内联 SVG）**

```tsx
import type { SVGProps } from 'react'

export type IconName =
  | 'search' | 'plus' | 'chat' | 'heart' | 'heartFilled' | 'user' | 'close' | 'send'
  | 'image' | 'check' | 'shield' | 'logout' | 'location' | 'eye' | 'star' | 'starFilled'
  | 'pencil' | 'flag' | 'crown' | 'inbox'

const PATHS: Record<IconName, string[]> = {
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M16.5 16.5 21 21'],
  plus: ['M12 5v14', 'M5 12h14'],
  chat: ['M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3h.5a8.4 8.4 0 0 1 8 8v.5z'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z'],
  heartFilled: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M21 15l-5-5L5 21'],
  check: ['M20 6 9 17l-5-5'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  location: ['M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  star: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z'],
  starFilled: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  crown: ['M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z'],
}

const FILLED: ReadonlySet<IconName> = new Set(['heartFilled', 'starFilled'])

export function Icon({ name, size = 18, className, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = FILLED.has(name)
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className={className} {...rest}
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}
```

- [ ] **Step 3: 写其余 UI 组件**

`src/components/ui/Button.tsx`：

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-deep',
  secondary: 'border border-line bg-white text-ink hover:border-brand hover:text-brand',
  ghost: 'text-muted hover:bg-[#eef2f7] hover:text-ink',
  danger: 'bg-[#d94f3d] text-white hover:bg-[#c0432f]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', loading = false, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-btn px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}
```

`src/components/ui/Badge.tsx`：

```tsx
import { ITEM_STATUS_LABELS, type ItemStatus } from '@/lib/constants'
import { cn } from '@/lib/utils'

const STATUS_CLASSES: Record<ItemStatus, string> = {
  ON_SALE: 'bg-[#e6f6f1] text-[#0b7d60]',
  RESERVED: 'bg-[#fdf3e0] text-[#b07407]',
  SOLD: 'bg-[#eef1f5] text-[#6b7686]',
  DELISTED: 'bg-[#f3f5f7] text-[#98a2b1]',
}

export function StatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLASSES[status], className)}>
      {ITEM_STATUS_LABELS[status]}
    </span>
  )
}

export function Chip({ children, tone = 'brand', className }: { children: React.ReactNode; tone?: 'brand' | 'price' | 'muted'; className?: string }) {
  const TONES = { brand: 'bg-[#e6f6f1] text-[#0b7d60]', price: 'bg-[#ffefe9] text-[#d6431f]', muted: 'bg-[#eef1f5] text-[#6b7686]' }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
}
```

`src/components/ui/Avatar.tsx`：

```tsx
import { cn } from '@/lib/utils'

const COLORS = ['#0fa47f', '#ff7a59', '#6a4ce0', '#f5a623', '#3b82f6', '#ec4899']

function colorOf(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return COLORS[h % COLORS.length]
}

export function Avatar({ src, name, size = 32, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className={cn('rounded-full object-cover', className)} />
  }
  return (
    <span
      aria-label={name}
      style={{ width: size, height: size, backgroundColor: colorOf(name), fontSize: size * 0.44 }}
      className={cn('inline-flex select-none items-center justify-center rounded-full font-semibold text-white', className)}
    >
      {Array.from(name)[0] ?? '?'}
    </span>
  )
}
```

`src/components/ui/Skeleton.tsx`：

```tsx
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-card bg-[#e8edf3]', className)} />
}
```

`src/components/ui/EmptyState.tsx`：

```tsx
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

export function EmptyState({ title, description, action, iconName = 'inbox' }: {
  title: string; description?: string; action?: ReactNode; iconName?: IconName
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-[#e6f6f1] text-brand"><Icon name={iconName} size={26} /></span>
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
```

`src/components/ui/Toast.tsx`：

```tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

interface ToastItem { id: number; type: 'success' | 'error'; message: string }
interface ToastContextValue { success: (message: string) => void; error: (message: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const push = useCallback((type: ToastItem['type'], message: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])
  return (
    <ToastContext.Provider value={{ success: (m) => push('success', m), error: (m) => push('error', m) }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className={t.type === 'success'
              ? 'flex items-center gap-1.5 rounded-btn bg-ink px-4 py-2 text-sm text-white shadow-card'
              : 'flex items-center gap-1.5 rounded-btn bg-[#d94f3d] px-4 py-2 text-sm text-white shadow-card'}>
            <Icon name={t.type === 'success' ? 'check' : 'flag'} size={15} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}
```

- [ ] **Step 4: 写 SiteHeader 与全局布局**

`src/components/layout/SiteHeader.tsx`：

```tsx
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

interface HeaderUser { username: string; avatarUrl: string | null; unreadCount: number }

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="shrink-0 text-lg font-extrabold text-brand">校园集市</Link>
        <form action="/" method="get" className="min-w-0 flex-1">
          <label className="flex items-center gap-2 rounded-full bg-[#eef2f7] px-3.5 py-1.5 text-sm text-muted focus-within:ring-2 focus-within:ring-brand/40">
            <Icon name="search" size={15} />
            <input name="q" placeholder="搜教材、单车、宿舍好物…" className="w-full bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
        </form>
        <Link href="/publish" className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-deep">
          <Icon name="plus" size={15} />发布闲置
        </Link>
        {user ? (
          <Link href="/me" className="relative shrink-0" aria-label="个人中心">
            <Avatar src={user.avatarUrl} name={user.username} size={32} />
            {user.unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-price px-1 text-[10px] font-bold text-white">
                {user.unreadCount > 99 ? '99+' : user.unreadCount}
              </span>
            )}
          </Link>
        ) : (
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <Link href="/login" className="font-semibold text-ink hover:text-brand">登录</Link>
            <Link href="/register" className="font-semibold text-brand hover:text-brand-deep">注册</Link>
          </div>
        )}
      </div>
    </header>
  )
}
```

`src/app/layout.tsx` 全量替换：

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { ToastProvider } from '@/components/ui/Toast'

export const metadata: Metadata = {
  title: '校园集市 · 校园二手交易平台',
  description: '大学校园二手交易平台：发布闲置、实时沟通、当面交易、互评信誉。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <ToastProvider>
          <SiteHeader user={null} />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: 写组件测试**

`tests/components/ui.test.tsx`（注意顶部 jsdom 注释）：

```tsx
/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Avatar } from '@/components/ui/Avatar'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ToastProvider, useToast } from '@/components/ui/Toast'

describe('StatusBadge', () => {
  it.each([
    ['ON_SALE', '在售'],
    ['RESERVED', '已预订'],
    ['SOLD', '已售出'],
    ['DELISTED', '已下架'],
  ] as const)('状态 %s → %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('Button', () => {
  it('loading 时禁用', () => {
    render(<Button loading>发布</Button>)
    expect(screen.getByRole('button', { name: /发布/ })).toBeDisabled()
  })
})

describe('EmptyState', () => {
  it('渲染标题与描述', () => {
    render(<EmptyState title="还没有商品" description="去发布第一件闲置吧" />)
    expect(screen.getByText('还没有商品')).toBeInTheDocument()
    expect(screen.getByText('去发布第一件闲置吧')).toBeInTheDocument()
  })
})

describe('Avatar', () => {
  it('无头像时回退为首字符', () => {
    render(<Avatar name="小鹿同学" />)
    expect(screen.getByText('小')).toBeInTheDocument()
  })
})

describe('Toast', () => {
  it('调用后显示消息，3 秒后消失', () => {
    vi.useFakeTimers()
    function Demo() {
      const toast = useToast()
      return <button onClick={() => toast.error('出错了')}>触发</button>
    }
    render(<ToastProvider><Demo /></ToastProvider>)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('出错了')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3100) })
    expect(screen.queryByText('出错了')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test
```

预期：ui.test.tsx 全部 PASS（若报 jsdom 缺失，检查 vitest.config.ts 的 include 已覆盖 `tests/**`）。

- [ ] **Step 7: 目视验证 + 提交**

```bash
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000 | grep -o "校园集市" | head -1
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：输出 `校园集市`（顶栏已渲染）。

```bash
git add -A
git commit -m "feat: 设计系统 token + 基础 UI 组件（Icon/Button/Badge/Avatar/Toast/EmptyState/Header）"
```

## 阶段 2：认证

> 说明：Spec 写的是 bcrypt（cost 10）。实现统一用 **`bcryptjs`**（纯 JS 实现同一算法）：Windows 无需编译、npm 安装不依赖 GitHub 二进制下载——符合"无 VPN"硬性约束。

### Task 6: 认证核心库（lib/api.ts + lib/auth.ts）

**Files:**
- Create: `src/lib/api.ts`、`src/lib/auth.ts`
- Create: `tests/helpers/factory.ts`（后续所有集成测试共用）
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Consumes: `prisma`（T3）
- Produces（后续任务按此签名调用）：
  - `ApiError extends Error`：`new ApiError(code, message, fields?)`；`code ∈ UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|VALIDATION|CONFLICT|INTERNAL`
  - `errorResponse(err): Response`（Route Handler 的 catch 统一出口）
  - `hashPassword(pw): Promise<string>` · `verifyPassword(pw, hash): Promise<boolean>`
  - `createSession(userId): Promise<{ token, expiresAt }>` · `destroySession(token): Promise<void>`
  - `validateSessionToken(token): Promise<AuthUser | null>`
  - `getSessionUser(cookieHeader: string | null): Promise<AuthUser | null>`
  - `requireUser(req: Request): Promise<AuthUser>` · `requireAdmin(req: Request): Promise<AuthUser>`
  - `buildSessionCookie(token): string` · `buildClearSessionCookie(): string` · `SESSION_COOKIE = 'session'`
  - `AuthUser = { id, username, email, avatarUrl, role, verifiedAt }`
  - 测试助手：`createTestUser(overrides?)`、`createTestSession(userId)`、`reqWithCookie(url, token, init?)`

- [ ] **Step 1: 安装 bcryptjs**

```bash
npm i bcryptjs
npm i -D @types/bcryptjs
```

（若 bcryptjs 当前版本自带类型，`@types/bcryptjs` 会是空壳包，无害。）

- [ ] **Step 2: 写失败的测试**

`tests/lib/auth.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  buildClearSessionCookie, buildSessionCookie, createSession, destroySession,
  hashPassword, requireAdmin, requireUser, validateSessionToken, verifyPassword,
} from '@/lib/auth'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

describe('密码哈希', () => {
  it('哈希可验证、错误密码拒绝、明文不出现在哈希里', async () => {
    const hash = await hashPassword('password123')
    expect(hash).not.toContain('password123')
    expect(await verifyPassword('password123', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })
})

describe('会话', () => {
  beforeEach(resetDb)

  it('签发后库里只有哈希，明文 token 可校验', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    const stored = await prisma.session.findFirst({ where: { userId: u.id } })
    expect(stored?.tokenHash).not.toBe(token)
    expect(await validateSessionToken(token)).toMatchObject({ id: u.id, username: u.username })
  })

  it('过期会话返回 null 并被清除', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    await prisma.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await validateSessionToken(token)).toBeNull()
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0)
  })

  it('封禁用户的会话立即失效并被清理', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    await prisma.user.update({ where: { id: u.id }, data: { status: 'BANNED' } })
    expect(await validateSessionToken(token)).toBeNull()
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0)
  })

  it('登出后 token 失效', async () => {
    const u = await createTestUser()
    const { token } = await createSession(u.id)
    await destroySession(token)
    expect(await validateSessionToken(token)).toBeNull()
  })
})

describe('requireUser / requireAdmin', () => {
  beforeEach(resetDb)

  it('无 cookie → UNAUTHENTICATED', async () => {
    await expect(requireUser(reqWithCookie('http://t/api', null))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('普通用户被 requireAdmin 拒绝（FORBIDDEN）', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    await expect(requireAdmin(reqWithCookie('http://t/api', token))).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('管理员通过 requireAdmin', async () => {
    const u = await createTestUser({ role: 'ADMIN' })
    const token = await createTestSession(u.id)
    expect((await requireAdmin(reqWithCookie('http://t/api', token))).role).toBe('ADMIN')
  })
})

describe('Cookie 构造', () => {
  it('会话 Cookie 带 HttpOnly / SameSite=Lax / Max-Age=2592000', () => {
    const c = buildSessionCookie('tok')
    expect(c).toContain('session=tok')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Max-Age=2592000')
  })
  it('清除 Cookie Max-Age=0', () => {
    expect(buildClearSessionCookie()).toContain('Max-Age=0')
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test
```

预期：FAIL，`Cannot find module '@/lib/auth'`。

- [ ] **Step 4: 实现 src/lib/api.ts**

```ts
import { ZodError } from 'zod'

export type ApiErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INTERNAL'

const STATUS_OF: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409, INTERNAL: 500,
}

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string, public fields?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Route Handler 的统一错误出口：把 ApiError / ZodError / 未知错误映射为规范响应 */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } },
      { status: STATUS_OF[err.code] },
    )
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message
    return Response.json({ error: { code: 'VALIDATION', message: '输入有误', fields } }, { status: 400 })
  }
  console.error('[api] 未处理错误:', err)
  return Response.json({ error: { code: 'INTERNAL', message: '服务器开小差了，请稍后再试' } }, { status: 500 })
}

/** 安全解析 JSON 请求体（格式错误 → VALIDATION 而不是裸 SyntaxError） */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ApiError('VALIDATION', '请求体不是合法 JSON')
  }
}
```

- [ ] **Step 5: 实现 src/lib/auth.ts**

```ts
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { ApiError } from '@/lib/api'
import { prisma } from '@/lib/db'

export const SESSION_COOKIE = 'session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000
const BCRYPT_COST = 10

export interface AuthUser {
  id: string
  username: string
  email: string
  avatarUrl: string | null
  role: string // USER | ADMIN
  verifiedAt: Date | null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 签发会话：明文 token 只在返回值里出现一次，库里只存哈希 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } })
  return { token, expiresAt }
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

/** 校验 token：不存在/过期/用户被封禁 → null（过期与封禁顺手清理该用户的会话） */
export async function validateSessionToken(token: string): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } })
    return null
  }
  if (session.user.status === 'BANNED') {
    await prisma.session.deleteMany({ where: { userId: session.userId } })
    return null
  }
  const u = session.user
  return { id: u.id, username: u.username, email: u.email, avatarUrl: u.avatarUrl, role: u.role, verifiedAt: u.verifiedAt }
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

export function getSessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  return parseCookieHeader(cookieHeader)[SESSION_COOKIE] ?? null
}

/** Route Handler 用：从 Request 的 cookie 头取当前用户；RSC 页面传 cookies().toString() */
export async function getSessionUser(cookieHeader: string | null): Promise<AuthUser | null> {
  const token = getSessionTokenFromCookieHeader(cookieHeader)
  if (!token) return null
  return validateSessionToken(token)
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const user = await getSessionUser(req.headers.get('cookie'))
  if (!user) throw new ApiError('UNAUTHENTICATED', '请先登录')
  return user
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req)
  if (user.role !== 'ADMIN') throw new ApiError('FORBIDDEN', '需要管理员权限')
  return user
}

export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}
```

- [ ] **Step 6: 实现测试助手 tests/helpers/factory.ts**

```ts
import { createSession, hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'

let seq = 0

export async function createTestUser(overrides: {
  username?: string
  email?: string
  role?: string
  status?: string
  verifiedAt?: Date | null
  campus?: string
} = {}) {
  seq += 1
  return prisma.user.create({
    data: {
      username: overrides.username ?? `用户${seq}`,
      email: overrides.email ?? `user${seq}@campus.dev`,
      passwordHash: await hashPassword('password123'),
      role: overrides.role ?? 'USER',
      status: overrides.status ?? 'ACTIVE',
      verifiedAt: overrides.verifiedAt ?? null,
      campus: overrides.campus ?? null,
    },
  })
}

export async function createTestSession(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return token
}

/** 构造带（或不带）session cookie 的 Request，供 Route Handler 直调测试 */
export function reqWithCookie(url: string, token: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  if (token) headers.set('cookie', `session=${token}`)
  return new Request(url, { ...init, headers })
}
```

- [ ] **Step 7: 运行确认通过**

```bash
npm test
```

预期：auth 测试全部 PASS。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 认证核心库（会话签发/校验/requireUser/requireAdmin）+ API 错误规范"
```

---

### Task 7: 认证 API（注册 / 登录 / 登出）

**Files:**
- Create: `src/app/api/auth/register/route.ts` · `login/route.ts` · `logout/route.ts`
- Test: `tests/api/auth.test.ts`

**Interfaces:**
- Consumes: T6 的 `hashPassword/verifyPassword/createSession/destroySession/buildSessionCookie/buildClearSessionCookie/errorResponse/ApiError/readJson`；T4 的 `registerSchema/loginSchema`
- Produces:
  - `POST /api/auth/register` → 200 `{user:{id,username}}` + Set-Cookie；冲突 → 409 `{fields:{email|username}}`
  - `POST /api/auth/login` → 200 `{user:{id,username}}` + Set-Cookie；失败 → 401（统一文案「邮箱或密码错误」）；封禁 → 403「账号已被封禁」
  - `POST /api/auth/logout` → 200 `{ok:true}` + 清除 Cookie

- [ ] **Step 1: 写失败的测试**

`tests/api/auth.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as healthGET } from '@/app/api/health/route' // 仅确保路由目录可被测试环境解析（可删）
import { POST as loginPOST } from '@/app/api/auth/login/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { POST as registerPOST } from '@/app/api/auth/register/route'
import { parseCookieHeader, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'

function jsonReq(url: string, body: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.cookie = `session=${token}`
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

function tokenFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? ''
  return parseCookieHeader(setCookie.replace(/;\s*/g, '; '))['session'] ?? ''
}

describe('POST /api/auth/register', () => {
  beforeEach(resetDb)

  it('注册成功：200 + HttpOnly Cookie + 用户入库', async () => {
    const res = await registerPOST(jsonReq('http://t/api/auth/register', {
      username: '小鹿', email: 'lu@campus.dev', password: 'password123',
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
    const token = tokenFrom(res)
    expect(token).not.toBe('')
    expect(await requireUser(jsonReq('http://t/x', {}, token))).toMatchObject({ username: '小鹿' })
  })

  it('邮箱重复 → 409 且 fields.email 有值', async () => {
    await registerPOST(jsonReq('http://t/api/auth/register', { username: '甲', email: 'a@campus.dev', password: 'password123' }))
    const res = await registerPOST(jsonReq('http://t/api/auth/register', { username: '乙', email: 'a@campus.dev', password: 'password123' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.fields.email).toBeTruthy()
  })

  it('密码 7 位 → 400 VALIDATION 且字段级错误', async () => {
    const res = await registerPOST(jsonReq('http://t/api/auth/register', { username: '丙', email: 'c@campus.dev', password: '1234567' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.password).toBeTruthy()
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(resetDb)

  async function seedUser() {
    await registerPOST(jsonReq('http://t/api/auth/register', { username: '小鹿', email: 'lu@campus.dev', password: 'password123' }))
  }

  it('登录成功返回 Cookie', async () => {
    await seedUser()
    const res = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'lu@campus.dev', password: 'password123' }))
    expect(res.status).toBe(200)
    expect(tokenFrom(res)).not.toBe('')
  })

  it('密码错误与邮箱不存在返回同一文案（防枚举）', async () => {
    await seedUser()
    const r1 = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'lu@campus.dev', password: 'wrong-pass' }))
    const r2 = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'nobody@campus.dev', password: 'password123' }))
    expect(r1.status).toBe(401)
    expect(r2.status).toBe(401)
    expect((await r1.json()).error.message).toBe((await r2.json()).error.message)
  })

  it('封禁用户无法登录（403）', async () => {
    await seedUser()
    await prisma.user.updateMany({ data: { status: 'BANNED' } })
    const res = await loginPOST(jsonReq('http://t/api/auth/login', { email: 'lu@campus.dev', password: 'password123' }))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/auth/logout', () => {
  beforeEach(resetDb)

  it('登出销毁会话并清 Cookie', async () => {
    const reg = await registerPOST(jsonReq('http://t/api/auth/register', { username: '小鹿', email: 'lu@campus.dev', password: 'password123' }))
    const token = tokenFrom(reg)
    const res = await logoutPOST(jsonReq('http://t/api/auth/logout', {}, token))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await prisma.session.count()).toBe(0)
  })
})
```

（第一行 healthGET 导入如果引起 lint 噪声可删掉，它不参与断言。）

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

预期：FAIL，`Cannot find module '@/app/api/auth/register/route'`。

- [ ] **Step 3: 实现三个 Route Handler**

`src/app/api/auth/register/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { buildSessionCookie, createSession, hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { registerSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    const input = registerSchema.parse(await readJson(req))
    const emailTaken = await prisma.user.findUnique({ where: { email: input.email } })
    if (emailTaken) throw new ApiError('CONFLICT', '该邮箱已注册', { email: '该邮箱已注册' })
    const usernameTaken = await prisma.user.findUnique({ where: { username: input.username } })
    if (usernameTaken) throw new ApiError('CONFLICT', '该昵称已被使用', { username: '该昵称已被使用' })

    const user = await prisma.user.create({
      data: { username: input.username, email: input.email, passwordHash: await hashPassword(input.password) },
    })
    const { token } = await createSession(user.id)
    const res = NextResponse.json({ user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', buildSessionCookie(token))
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
```

`src/app/api/auth/login/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { buildSessionCookie, createSession, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loginSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    const input = loginSchema.parse(await readJson(req))
    const user = await prisma.user.findUnique({ where: { email: input.email } })
    // 统一文案：邮箱不存在与密码错误不区分（防枚举）
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiError('UNAUTHENTICATED', '邮箱或密码错误')
    }
    if (user.status === 'BANNED') {
      throw new ApiError('FORBIDDEN', '账号已被封禁，如有疑问请联系管理员')
    }
    const { token } = await createSession(user.id)
    const res = NextResponse.json({ user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', buildSessionCookie(token))
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
```

`src/app/api/auth/logout/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api'
import { buildClearSessionCookie, destroySession, getSessionTokenFromCookieHeader } from '@/lib/auth'

export async function POST(req: Request): Promise<Response> {
  try {
    const token = getSessionTokenFromCookieHeader(req.headers.get('cookie'))
    if (token) await destroySession(token)
    const res = NextResponse.json({ ok: true })
    res.headers.set('Set-Cookie', buildClearSessionCookie())
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm test
```

预期：auth API 测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 注册/登录/登出 API（防枚举统一文案、封禁拦截、HttpOnly 会话 Cookie）"
```

### Task 8: 客户端 API 封装 + 登录/注册页面 + 顶栏登录态

**Files:**
- Create: `src/lib/client-api.ts`（`useApi`，全站客户端请求的统一入口）
- Create: `src/components/ui/Input.tsx` · `Textarea.tsx`
- Create: `src/components/auth/LoginForm.tsx` · `RegisterForm.tsx`
- Create: `src/app/login/page.tsx` · `src/app/register/page.tsx`
- Modify: `src/app/layout.tsx`（读登录态传给 SiteHeader）
- Test: `tests/components/login-form.test.tsx`

**Interfaces:**
- Consumes: T7 的 API、T6 的 `getSessionUser`、T5 的 Button/Toast
- Produces（后续所有客户端表单/按钮统一使用）：
  - `useApi(): { request: <T>(url, init?) => Promise<ApiResult<T>> }`
  - `ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string> }`
  - 行为约定：网络异常/非字段错误 → 自动 Toast；**401 → Toast「登录已过期，请重新登录」并跳转 `/login?next=<当前路径>`**（Review Focus #3）；返回 `fields` 时不弹 Toast，交给表单内联显示
  - `Input({ label?, error?, ...inputProps })` · `Textarea({ label?, error?, ...textareaProps })`

- [ ] **Step 1: 写 useApi**

`src/lib/client-api.ts`：

```ts
'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields?: Record<string, string> }

export function useApi(): { request: <T>(url: string, init?: RequestInit) => Promise<ApiResult<T>> } {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()

  const request = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> => {
      let res: Response
      try {
        res = await fetch(url, {
          ...init,
          headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
        })
      } catch {
        toast.error('网络异常，请检查网络后重试')
        return { ok: false, message: '网络异常' }
      }
      if (res.status === 401) {
        toast.error('登录已过期，请重新登录')
        router.push(`/login?next=${encodeURIComponent(pathname)}`)
        return { ok: false, message: '未登录' }
      }
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const fields: Record<string, string> | undefined = body?.error?.fields
        const message: string = body?.error?.message ?? '操作失败，请稍后再试'
        if (!fields) toast.error(message)
        return { ok: false, message, fields }
      }
      return { ok: true, data: body as T }
    },
    [router, pathname, toast],
  )

  return { request }
}
```

- [ ] **Step 2: 写 Input / Textarea**

`src/components/ui/Input.tsx`：

```tsx
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, name, ...rest }: InputProps) {
  const inputId = id ?? name
  return (
    <label className="block text-sm" htmlFor={inputId}>
      {label && <span className="mb-1 block font-medium">{label}</span>}
      <input
        id={inputId}
        name={name}
        className={cn(
          'w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20',
          error && 'border-[#d94f3d]',
          className,
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-[#d94f3d]">{error}</span>}
    </label>
  )
}
```

`src/components/ui/Textarea.tsx`：

```tsx
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, name, ...rest }: TextareaProps) {
  const inputId = id ?? name
  return (
    <label className="block text-sm" htmlFor={inputId}>
      {label && <span className="mb-1 block font-medium">{label}</span>}
      <textarea
        id={inputId}
        name={name}
        className={cn(
          'w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20',
          error && 'border-[#d94f3d]',
          className,
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-[#d94f3d]">{error}</span>}
    </label>
  )
}
```

- [ ] **Step 3: 写登录/注册表单（客户端组件）**

`src/components/auth/LoginForm.tsx`：

```tsx
'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useApi } from '@/lib/client-api'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFieldErrors({})
    const form = new FormData(e.currentTarget)
    const result = await request<{ user: { id: string; username: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    })
    setLoading(false)
    if (result.ok) {
      router.push(searchParams.get('next') ?? '/')
      router.refresh()
      return
    }
    if (result.fields) setFieldErrors(result.fields)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="邮箱" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <Input label="密码" name="password" type="password" autoComplete="current-password" required error={fieldErrors.password} />
      <Button type="submit" loading={loading} className="w-full">登录</Button>
      <p className="text-center text-sm text-muted">
        还没有账号？<Link href="/register" className="font-semibold text-brand">注册一个</Link>
      </p>
    </form>
  )
}
```

`src/components/auth/RegisterForm.tsx`：

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useApi } from '@/lib/client-api'

export function RegisterForm() {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFieldErrors({})
    const form = new FormData(e.currentTarget)
    const result = await request<{ user: { id: string; username: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username'),
        email: form.get('email'),
        password: form.get('password'),
      }),
    })
    setLoading(false)
    if (result.ok) {
      router.push('/')
      router.refresh()
      return
    }
    if (result.fields) setFieldErrors(result.fields)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="昵称" name="username" required maxLength={20} error={fieldErrors.username} placeholder="同学们怎么称呼你" />
      <Input label="邮箱" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <Input label="密码" name="password" type="password" autoComplete="new-password" required minLength={8} error={fieldErrors.password} placeholder="至少 8 位" />
      <Button type="submit" loading={loading} className="w-full">注册并登录</Button>
      <p className="text-center text-sm text-muted">
        已有账号？<Link href="/login" className="font-semibold text-brand">直接登录</Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 4: 写两个页面（已登录自动跳走）**

`src/app/login/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { getSessionUser } from '@/lib/auth'

export default async function LoginPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (user) redirect('/')
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-6 text-xl font-extrabold">欢迎回来</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
```

（`useSearchParams` 需要 Suspense 边界，Next 会构建期报错提醒。）

`src/app/register/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { getSessionUser } from '@/lib/auth'

export default async function RegisterPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (user) redirect('/')
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-6 text-xl font-extrabold">加入校园集市</h1>
      <RegisterForm />
    </div>
  )
}
```

- [ ] **Step 5: 顶栏接入登录态**

`src/app/layout.tsx` 全量替换为：

```tsx
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { ToastProvider } from '@/components/ui/Toast'
import { getSessionUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: '校园集市 · 校园二手交易平台',
  description: '大学校园二手交易平台：发布闲置、实时沟通、当面交易、互评信誉。',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser((await cookies()).toString())
  const unreadCount = 0 // T20 接入真实未读数
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <ToastProvider>
          <SiteHeader
            user={user ? { username: user.username, avatarUrl: user.avatarUrl, unreadCount } : null}
          />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 6: 写表单测试**

`tests/components/login-form.test.tsx`：

```tsx
/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LoginForm } from '@/components/auth/LoginForm'
import { ToastProvider } from '@/components/ui/Toast'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

describe('LoginForm', () => {
  beforeEach(() => pushMock.mockClear())

  it('登录成功后跳转首页', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', username: '小鹿' } }), { status: 200 }),
    ))
    render(<ToastProvider><LoginForm /></ToastProvider>)
    await userEvent.type(screen.getByLabelText('邮箱'), 'lu@campus.dev')
    await userEvent.type(screen.getByLabelText('密码'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
  })

  it('字段级错误内联显示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'VALIDATION', message: '输入有误', fields: { password: '密码至少 8 位' } } }), { status: 400 }),
    ))
    render(<ToastProvider><LoginForm /></ToastProvider>)
    await userEvent.type(screen.getByLabelText('邮箱'), 'lu@campus.dev')
    await userEvent.type(screen.getByLabelText('密码'), 'short')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('密码至少 8 位')).toBeInTheDocument()
  })
})
```

注意：`getByLabelText('邮箱')` 依赖 Input 里 `<label>` 包 `<input>` 的结构（T8 Step 2 的设计）。

再写 `tests/lib/client-api.test.tsx`（Review Focus #3：401 → 提示 + 引导重登）：

```tsx
/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/publish',
}))

function Demo() {
  const { request } = useApi()
  return <button onClick={() => void request('/api/anything', { method: 'POST' })}>发请求</button>
}

describe('useApi 的 401 处理', () => {
  beforeEach(() => pushMock.mockClear())

  it('401 → Toast 提示并跳转登录页（带 next）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '请先登录' } }), { status: 401 }),
    ))
    render(<ToastProvider><Demo /></ToastProvider>)
    await userEvent.click(screen.getByText('发请求'))
    expect(await screen.findByText('登录已过期，请重新登录')).toBeInTheDocument()
    expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fpublish')
  })

  it('字段级错误不弹 Toast、返回 fields 给表单内联显示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'VALIDATION', message: '输入有误', fields: { title: '太短' } } }), { status: 400 }),
    ))
    render(<ToastProvider><Demo /></ToastProvider>)
    await userEvent.click(screen.getByText('发请求'))
    await screen.findByRole('button', { name: '发请求' })
    expect(screen.queryByText('输入有误')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 7: 运行测试确认通过**

```bash
npm test
```

预期：login-form 测试 PASS。

- [ ] **Step 8: 手动验证 + 提交**

```bash
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000/login | grep -o "欢迎回来" | head -1
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：输出 `欢迎回来`。

```bash
git add -A
git commit -m "feat: 登录/注册页面 + useApi 客户端封装（401 引导重登）+ 顶栏登录态"
```

---

### Task 9: Origin 同源校验（写操作）

**Files:**
- Create: `src/lib/origin.ts`
- Modify: `src/app/api/auth/register/route.ts` · `login/route.ts` · `logout/route.ts`（POST 开头调用校验）
- Test: `tests/lib/origin.test.ts`；在 `tests/api/auth.test.ts` 追加 1 条用例

**Interfaces:**
- Consumes: T6 的 `ApiError`
- Produces: `ensureSameOrigin(req: Request): void` —— 写操作（POST/PUT/PATCH/DELETE）若带 `Origin` 头且与 `Host` 不同源 → 抛 `FORBIDDEN`「来源不合法」；无 `Origin` 放行

- [ ] **Step 1: 写失败的测试**

`tests/lib/origin.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { ensureSameOrigin } from '@/lib/origin'

function req(method: string, headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/x', { method, headers })
}

describe('ensureSameOrigin', () => {
  it('跨源 Origin → 抛 FORBIDDEN', () => {
    expect(() => ensureSameOrigin(req('POST', { origin: 'https://evil.com', host: 'localhost:3000' }))).toThrowError('来源不合法')
  })
  it('同源 Origin → 放行', () => {
    expect(() => ensureSameOrigin(req('POST', { origin: 'http://localhost:3000', host: 'localhost:3000' }))).not.toThrow()
  })
  it('无 Origin（curl / 服务端调用）→ 放行', () => {
    expect(() => ensureSameOrigin(req('POST', { host: 'localhost:3000' }))).not.toThrow()
  })
  it('GET 不校验', () => {
    expect(() => ensureSameOrigin(req('GET', { origin: 'https://evil.com', host: 'localhost:3000' }))).not.toThrow()
  })
  it('畸形 Origin 字符串 → 抛 FORBIDDEN', () => {
    expect(() => ensureSameOrigin(req('POST', { origin: 'not-a-url', host: 'localhost:3000' }))).toThrow()
  })
})
```

在 `tests/api/auth.test.ts` 的 register describe 里追加：

```ts
  it('跨源 Origin 注册被拒绝（403）', async () => {
    const res = await registerPOST(new Request('http://t/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.com', host: 'localhost:3000' },
      body: JSON.stringify({ username: '跨源', email: 'evil@campus.dev', password: 'password123' }),
    }))
    expect(res.status).toBe(403)
  })
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

预期：origin.test.ts FAIL（模块不存在）；auth 跨源用例 FAIL（返回 200）。

- [ ] **Step 3: 实现**

`src/lib/origin.ts`：

```ts
import { ApiError } from '@/lib/api'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** 写操作同源校验（CSRF 兜底）：Origin 存在且与 Host 不同源 → FORBIDDEN；无 Origin 放行 */
export function ensureSameOrigin(req: Request): void {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) return
  const origin = req.headers.get('origin')
  if (!origin) return
  const host = req.headers.get('host')
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ApiError('FORBIDDEN', '来源不合法')
  }
  if (!host || originHost !== host) throw new ApiError('FORBIDDEN', '来源不合法')
}
```

三个 auth 路由的 `POST` 第一行（try 块内第一句）加：

```ts
    ensureSameOrigin(req)
```

并在 import 区加 `import { ensureSameOrigin } from '@/lib/origin'`。

- [ ] **Step 4: 运行确认通过**

```bash
npm test
```

预期：全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 写操作 Origin 同源校验（CSRF 兜底）"
```

## 阶段 3：商品闭环

### Task 10: 图片上传管线（storage.ts + /api/upload）

**Files:**
- Create: `src/lib/storage.ts`、`src/app/api/upload/route.ts`
- Test: `tests/api/upload.test.ts`

**Interfaces:**
- Consumes: T6 的 `requireUser`/`ApiError`、T9 的 `ensureSameOrigin`
- Produces：
  - `storage.putImage(buffer: Buffer): Promise<{ url: string; width: number; height: number }>`（`src/lib/storage.ts`；切换 OSS 时只换 `storage` 的实现）
  - `POST /api/upload`（multipart，字段名 `file`）→ 200 `{ url: '/uploads/yyyy/<uuid>.webp', width, height }`；未登录 401；种类/大小/假图 → 400

- [ ] **Step 1: 安装 sharp**

```bash
npm i sharp
```

- [ ] **Step 2: 写失败的测试**

`tests/api/upload.test.ts`：

```ts
import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as uploadPOST } from '@/app/api/upload/route'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser } from '../helpers/factory'

const written: string[] = []

function uploadReq(token: string | null, file: File): Request {
  const form = new FormData()
  form.append('file', file)
  const headers: Record<string, string> = { host: 'localhost:3000' }
  if (token) headers.cookie = `session=${token}`
  return new Request('http://localhost:3000/api/upload', { method: 'POST', headers, body: form })
}

async function pngFile(width = 40, height = 30, name = 'a.png'): Promise<File> {
  const buf = await sharp({ create: { width, height, channels: 3, background: '#0fa47f' } }).png().toBuffer()
  return new File([buf], name, { type: 'image/png' })
}

afterAll(async () => {
  for (const f of written) {
    if (existsSync(f)) await unlink(f)
  }
})

describe('POST /api/upload', () => {
  beforeEach(resetDb)

  it('登录后上传成功：返回 /uploads/ 路径与真实宽高，文件落盘且转为 WebP', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await uploadPOST(uploadReq(token, await pngFile(40, 30)))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toMatch(/^\/uploads\/\d{4}\/[\w-]+\.webp$/)
    expect(body).toMatchObject({ width: 40, height: 30 })
    const onDisk = path.join(process.cwd(), 'public', body.url)
    written.push(onDisk)
    expect(existsSync(onDisk)).toBe(true)
  })

  it('未登录 → 401', async () => {
    const res = await uploadPOST(uploadReq(null, await pngFile()))
    expect(res.status).toBe(401)
  })

  it('超过 5MB → 400', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    const res = await uploadPOST(uploadReq(token, big))
    expect(res.status).toBe(400)
  })

  it('非白名单 MIME → 400', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const txt = new File([new TextEncoder().encode('hello')], 'a.txt', { type: 'text/plain' })
    const res = await uploadPOST(uploadReq(token, txt))
    expect(res.status).toBe(400)
  })

  it('伪装成 PNG 的垃圾数据 → 400（不信任客户端声明）', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const fake = new File([new TextEncoder().encode('not an image at all')], 'fake.png', { type: 'image/png' })
    const res = await uploadPOST(uploadReq(token, fake))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test
```

预期：FAIL，`Cannot find module '@/app/api/upload/route'`。

- [ ] **Step 4: 实现 storage.ts**

```ts
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export interface StoredImage {
  url: string
  width: number
  height: number
}

export interface Storage {
  /** 保存一张已通过初筛的图片：转 WebP、修正 EXIF 方向，返回 URL 与输出像素尺寸 */
  putImage(buffer: Buffer): Promise<StoredImage>
}

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads')

/** 本地磁盘实现（无 VPN 硬约束下的默认）；未来切 OSS/CDN 只替换这个对象 */
const localStorageImpl: Storage = {
  async putImage(buffer: Buffer): Promise<StoredImage> {
    const year = String(new Date().getFullYear())
    const dir = path.join(UPLOAD_ROOT, year)
    await mkdir(dir, { recursive: true })
    const fileName = `${randomUUID()}.webp`
    const info = await sharp(buffer).rotate().webp({ quality: 82 }).toFile(path.join(dir, fileName))
    return { url: `/uploads/${year}/${fileName}`, width: info.width, height: info.height }
  },
}

export const storage: Storage = localStorageImpl
```

- [ ] **Step 5: 实现 upload 路由**

`src/app/api/upload/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { ensureSameOrigin } from '@/lib/origin'
import { storage } from '@/lib/storage'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    await requireUser(req)
    const form = await req.formData().catch(() => {
      throw new ApiError('VALIDATION', '请求格式不正确')
    })
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError('VALIDATION', '缺少图片文件')
    if (file.size > MAX_BYTES) throw new ApiError('VALIDATION', '图片不能超过 5MB')
    if (!ALLOWED_MIME.has(file.type)) throw new ApiError('VALIDATION', '仅支持 JPG / PNG / WebP')

    const buffer = Buffer.from(await file.arrayBuffer())
    let stored
    try {
      stored = await storage.putImage(buffer)
    } catch {
      throw new ApiError('VALIDATION', '文件不是有效图片')
    }
    return NextResponse.json(stored)
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 6: 运行确认通过**

```bash
npm test
```

预期：upload 测试全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 图片上传管线（sharp 转 WebP + 读宽高 + Storage 接口）"
```

---

### Task 11: 商品状态机 + 发布 API

**Files:**
- Create: `src/lib/state-machine.ts`
- Create: `src/app/api/items/route.ts`（本任务只有 POST；T12 追加 GET）
- Test: `tests/lib/state-machine.test.ts`、`tests/api/items-create.test.ts`

**Interfaces:**
- Consumes: T4 的 `parseItemInput`/`ItemInput`、T6/T9 的守卫工具
- Produces（后续所有状态操作依赖）：
  - `canTransition(status: ItemStatus, action: ItemAction, ctx: { actor: 'SELLER'|'ADMIN'|'OTHER'; delistedBy?: string|null }): string | null`（null=允许；字符串=拒绝原因）
  - `applyTransition(status: ItemStatus, action: ItemAction): ItemStatus`
  - `ItemAction = 'RESERVE' | 'UNRESERVE' | 'MARK_SOLD' | 'DELIST' | 'RELIST'`
  - `POST /api/items` → 200 `{ item: { id } }`；未登录 401；校验失败 400

- [ ] **Step 1: 写状态机测试（全覆盖真值表）**

`tests/lib/state-machine.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { applyTransition, canTransition } from '@/lib/state-machine'

const seller = { actor: 'SELLER' as const }
const admin = { actor: 'ADMIN' as const }
const other = { actor: 'OTHER' as const }

describe('canTransition', () => {
  it('RESERVE：仅卖家 + 在售', () => {
    expect(canTransition('ON_SALE', 'RESERVE', seller)).toBeNull()
    expect(canTransition('ON_SALE', 'RESERVE', admin)).not.toBeNull()
    expect(canTransition('RESERVED', 'RESERVE', seller)).not.toBeNull()
    expect(canTransition('SOLD', 'RESERVE', seller)).not.toBeNull()
  })

  it('UNRESERVE：仅卖家 + 已预订', () => {
    expect(canTransition('RESERVED', 'UNRESERVE', seller)).toBeNull()
    expect(canTransition('ON_SALE', 'UNRESERVE', seller)).not.toBeNull()
  })

  it('MARK_SOLD：仅卖家 + 在售/已预订；SOLD 终态不可再操作', () => {
    expect(canTransition('ON_SALE', 'MARK_SOLD', seller)).toBeNull()
    expect(canTransition('RESERVED', 'MARK_SOLD', seller)).toBeNull()
    expect(canTransition('SOLD', 'MARK_SOLD', seller)).not.toBeNull()
    expect(canTransition('DELISTED', 'MARK_SOLD', seller)).not.toBeNull()
    expect(canTransition('ON_SALE', 'MARK_SOLD', admin)).not.toBeNull()
  })

  it('DELIST：卖家与管理员都可，SOLD/DELISTED 不可', () => {
    expect(canTransition('ON_SALE', 'DELIST', seller)).toBeNull()
    expect(canTransition('RESERVED', 'DELIST', admin)).toBeNull()
    expect(canTransition('SOLD', 'DELIST', admin)).not.toBeNull()
    expect(canTransition('DELISTED', 'DELIST', admin)).not.toBeNull()
  })

  it('RELIST：仅卖家；管理员下架的商品不可重新上架（Review Focus #2）', () => {
    expect(canTransition('DELISTED', 'RELIST', { ...seller, delistedBy: 'USER' })).toBeNull()
    expect(canTransition('DELISTED', 'RELIST', { ...seller, delistedBy: 'ADMIN' })).not.toBeNull()
    expect(canTransition('DELISTED', 'RELIST', admin)).not.toBeNull()
    expect(canTransition('ON_SALE', 'RELIST', seller)).not.toBeNull()
  })

  it('非卖家非管理员（OTHER）任何操作都拒绝', () => {
    expect(canTransition('ON_SALE', 'RESERVE', other)).not.toBeNull()
    expect(canTransition('ON_SALE', 'DELIST', other)).not.toBeNull()
  })
})

describe('applyTransition', () => {
  it.each([
    ['ON_SALE', 'RESERVE', 'RESERVED'],
    ['RESERVED', 'UNRESERVE', 'ON_SALE'],
    ['ON_SALE', 'MARK_SOLD', 'SOLD'],
    ['RESERVED', 'MARK_SOLD', 'SOLD'],
    ['ON_SALE', 'DELIST', 'DELISTED'],
    ['DELISTED', 'RELIST', 'ON_SALE'],
  ] as const)('%s --%s--> %s', (from, action, expected) => {
    expect(applyTransition(from, action)).toBe(expected)
  })
})
```

- [ ] **Step 2: 写发布 API 测试**

`tests/api/items-create.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { POST as createItemPOST } from '@/app/api/items/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const validBody = {
  title: '《数据结构》严蔚敏 九成新',
  description: '东区当面交易，无笔记，封面完好无损。',
  priceYuan: 15,
  negotiable: true,
  category: 'BOOKS',
  condition: 'LIKE_NEW_90',
  location: '东区3号楼',
  images: [{ url: '/uploads/2026/a.webp', width: 800, height: 600 }],
}

describe('POST /api/items', () => {
  beforeEach(resetDb)

  it('发布成功：商品与图片入库、图片顺序保留', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await createItemPOST(reqWithCookie('http://t/api/items', token, {
      method: 'POST',
      body: JSON.stringify({
        ...validBody,
        images: [
          { url: '/uploads/2026/a.webp', width: 800, height: 600 },
          { url: '/uploads/2026/b.webp', width: 600, height: 800 },
        ],
      }),
    }))
    expect(res.status).toBe(200)
    const item = await prisma.item.findFirstOrThrow({ include: { images: { orderBy: { sort: 'asc' } } } })
    expect(item.priceCents).toBe(1500)
    expect(item.status).toBe('ON_SALE')
    expect(item.images.map((i) => i.url)).toEqual(['/uploads/2026/a.webp', '/uploads/2026/b.webp'])
  })

  it('未登录 → 401', async () => {
    const res = await createItemPOST(reqWithCookie('http://t/api/items', null, {
      method: 'POST', body: JSON.stringify(validBody),
    }))
    expect(res.status).toBe(401)
  })

  it('校验失败（价格超上限）→ 400 字段级错误', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await createItemPOST(reqWithCookie('http://t/api/items', token, {
      method: 'POST', body: JSON.stringify({ ...validBody, priceYuan: 100000 }),
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.fields.priceYuan).toBeTruthy()
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test
```

预期：两个新测试文件 FAIL（模块不存在）。

- [ ] **Step 4: 实现 state-machine.ts**

```ts
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
```

- [ ] **Step 5: 实现 POST /api/items**

`src/app/api/items/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { parseItemInput } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const input = parseItemInput(await readJson(req))
    const item = await prisma.item.create({
      data: {
        title: input.title,
        description: input.description,
        priceCents: input.priceCents,
        negotiable: input.negotiable,
        category: input.category,
        condition: input.condition,
        location: input.location,
        sellerId: user.id,
        images: {
          create: input.images.map((img, index) => ({ url: img.url, width: img.width, height: img.height, sort: index })),
        },
      },
    })
    return NextResponse.json({ item: { id: item.id } })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 6: 运行确认通过**

```bash
npm test
```

预期：状态机真值表 + 发布 API 测试全 PASS。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 商品状态机（纯函数全真值表测试）+ 发布 API"
```

### Task 12: 商品列表 API（游标分页 / 筛选 / 搜索 / 排序）

**Files:**
- Create: `src/lib/items.ts`（查询与序列化的公共层）
- Modify: `src/app/api/items/route.ts`（追加 GET）
- Test: `tests/api/items-list.test.ts`

**Interfaces:**
- Consumes: T4 的 `paginationSchema`/`CATEGORIES`、T3 的 prisma
- Produces（RSC 页面与 API 共用）：
  - `ItemCardData`：`{ id, title, priceCents, negotiable, location, status, cover: {url,width,height}|null, seller: {id,username,avatarUrl,verifiedAt: string|null} }`
  - `toItemCardData(row): ItemCardData`
  - `queryItems(params: { category?, q?, sort?, cursor?, limit, sellerId?, statuses? }): Promise<{ items: <Prisma 行>[]; nextCursor: string | null }>`（默认只看 `ON_SALE`/`RESERVED`）
  - `GET /api/items?category=&q=&sort=latest|price_asc|price_desc&cursor=&limit=` → `{ items: ItemCardData[], nextCursor }`；非法分类 400

- [ ] **Step 1: 写失败的测试**

`tests/api/items-list.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as itemsGET } from '@/app/api/items/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestUser } from '../helpers/factory'

async function seedItems() {
  const seller = await createTestUser()
  const mk = (title: string, priceCents: number, createdAt: string, overrides: Record<string, unknown> = {}) =>
    prisma.item.create({
      data: {
        title, description: `${title} 的描述文字够长了吧`, priceCents,
        category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区',
        sellerId: seller.id, createdAt: new Date(createdAt),
        images: { create: [{ url: '/uploads/2026/a.webp', width: 800, height: 600, sort: 0 }] },
        ...overrides,
      },
    })
  await mk('教材甲', 1000, '2026-10-01T10:00:00Z')
  await mk('教材乙', 3000, '2026-10-02T10:00:00Z')
  await mk('数码丙', 2000, '2026-10-03T10:00:00Z')
  await mk('教材丁已售', 500, '2026-10-04T10:00:00Z', { status: 'SOLD' })
  await mk('教材戊下架', 600, '2026-10-05T10:00:00Z', { status: 'DELISTED' })
  return seller
}

function get(query: string): Promise<Response> {
  return itemsGET(new Request(`http://t/api/items?${query}`))
}

describe('GET /api/items', () => {
  beforeEach(resetDb)

  it('默认按最新排序、排除已售/已下架、包含 cover 与 seller', async () => {
    await seedItems()
    const res = await get('')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.items.map((i: { title: string }) => i.title)).toEqual(['数码丙', '教材乙', '教材甲'])
    expect(data.items[0].cover).toMatchObject({ url: '/uploads/2026/a.webp', width: 800, height: 600 })
    expect(data.items[0].seller.username).toBeTruthy()
  })

  it('游标分页：两页无重叠且顺序连续', async () => {
    await seedItems()
    const p1 = await (await get('limit=2')).json()
    expect(p1.items).toHaveLength(2)
    expect(p1.nextCursor).toBeTruthy()
    const p2 = await (await get(`limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).json()
    expect(p2.items).toHaveLength(1)
    expect(p2.nextCursor).toBeNull()
    const titles = [...p1.items, ...p2.items].map((i: { title: string }) => i.title)
    expect(new Set(titles).size).toBe(3)
  })

  it('价格升序排序 + 游标翻页', async () => {
    await seedItems()
    const p1 = await (await get('sort=price_asc&limit=2')).json()
    expect(p1.items.map((i: { priceCents: number }) => i.priceCents)).toEqual([1000, 2000])
    const p2 = await (await get(`sort=price_asc&limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).json()
    expect(p2.items.map((i: { priceCents: number }) => i.priceCents)).toEqual([3000])
  })

  it('搜索命中标题或描述', async () => {
    await seedItems()
    const byTitle = await (await get('q=' + encodeURIComponent('数码'))).json()
    expect(byTitle.items.map((i: { title: string }) => i.title)).toEqual(['数码丙'])
    const byDesc = await (await get('q=' + encodeURIComponent('的描述文字'))).json()
    expect(byDesc.items).toHaveLength(3)
  })

  it('分类过滤；非法分类 400', async () => {
    await seedItems()
    expect((await (await get('category=BOOKS')).json()).items).toHaveLength(3)
    expect((await get('category=HACK')).status).toBe(400)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

预期：FAIL（GET 未实现 / items.ts 不存在）。

- [ ] **Step 3: 实现 src/lib/items.ts**

```ts
import type { Prisma } from '@prisma/client'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'

export type ItemSort = 'latest' | 'price_asc' | 'price_desc'

export const PUBLIC_STATUSES: ItemStatus[] = ['ON_SALE', 'RESERVED']

export interface ItemCardData {
  id: string
  title: string
  priceCents: number
  negotiable: boolean
  location: string
  status: ItemStatus
  cover: { url: string; width: number; height: number } | null
  seller: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
}

const cardInclude = {
  images: { orderBy: { sort: 'asc' }, take: 1 },
  seller: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } },
} satisfies Prisma.ItemInclude

export async function queryItems(params: {
  category?: string
  q?: string
  sort?: ItemSort
  cursor?: string | null
  limit: number
  sellerId?: string
  statuses?: ItemStatus[]
}) {
  const sort: ItemSort = params.sort ?? 'latest'
  const where: Prisma.ItemWhereInput = { status: { in: params.statuses ?? PUBLIC_STATUSES } }
  if (params.category) where.category = params.category
  if (params.sellerId) where.sellerId = params.sellerId
  if (params.q) {
    where.OR = [{ title: { contains: params.q } }, { description: { contains: params.q } }]
  }

  const cursor = params.cursor ? decodeCursor(params.cursor) : null
  const cursorFilter: Prisma.ItemWhereInput | undefined = cursor
    ? sort === 'latest'
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.v as string) } },
            { createdAt: new Date(cursor.v as string), id: { lt: cursor.id } },
          ],
        }
      : sort === 'price_asc'
        ? {
            OR: [
              { priceCents: { gt: Number(cursor.v) } },
              { priceCents: Number(cursor.v), id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { priceCents: { lt: Number(cursor.v) } },
              { priceCents: Number(cursor.v), id: { lt: cursor.id } },
            ],
          }
    : undefined

  const rows = await prisma.item.findMany({
    where: cursorFilter ? { AND: [where, cursorFilter] } : where,
    orderBy:
      sort === 'latest'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : sort === 'price_asc'
          ? [{ priceCents: 'asc' }, { id: 'desc' }]
          : [{ priceCents: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
    include: cardInclude,
  })

  const hasMore = rows.length > params.limit
  const items = hasMore ? rows.slice(0, params.limit) : rows
  const last = items.at(-1)
  const nextCursor =
    hasMore && last
      ? encodeCursor(
          sort === 'latest'
            ? { v: last.createdAt.toISOString(), id: last.id }
            : { v: last.priceCents, id: last.id },
        )
      : null

  return { items, nextCursor }
}

interface CursorPayload {
  v: string | number
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as CursorPayload
    if (parsed && typeof parsed.id === 'string' && (typeof parsed.v === 'string' || typeof parsed.v === 'number')) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

type ItemRowWithCard = Prisma.ItemGetPayload<{ include: typeof cardInclude }>

export function toItemCardData(row: ItemRowWithCard): ItemCardData {
  const image = row.images[0]
  return {
    id: row.id,
    title: row.title,
    priceCents: row.priceCents,
    negotiable: row.negotiable,
    location: row.location,
    status: row.status as ItemStatus,
    cover: image ? { url: image.url, width: image.width, height: image.height } : null,
    seller: {
      id: row.seller.id,
      username: row.seller.username,
      avatarUrl: row.seller.avatarUrl,
      verifiedAt: row.seller.verifiedAt ? row.seller.verifiedAt.toISOString() : null,
    },
  }
}
```

- [ ] **Step 4: 给 items 路由追加 GET**

`src/app/api/items/route.ts` 追加（保留已有 POST）：

```ts
import { ApiError } from '@/lib/api' // 加到现有 import
import { CATEGORIES, type Category } from '@/lib/constants'
import { paginationSchema } from '@/lib/validators'
import { queryItems, toItemCardData, type ItemSort } from '@/lib/items'

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const { cursor, limit } = paginationSchema.parse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    })
    const category = url.searchParams.get('category') ?? undefined
    if (category && !CATEGORIES.includes(category as Category)) {
      throw new ApiError('VALIDATION', '分类不存在')
    }
    const sortParam = url.searchParams.get('sort')
    const sort: ItemSort =
      sortParam === 'price_asc' || sortParam === 'price_desc' ? sortParam : 'latest'
    const q = url.searchParams.get('q')?.trim() || undefined

    const { items, nextCursor } = await queryItems({ category, q, sort, cursor, limit })
    return NextResponse.json({ items: items.map(toItemCardData), nextCursor })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 5: 运行确认通过**

```bash
npm test
```

预期：列表 API 测试全 PASS。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 商品列表 API（游标分页/搜索/筛选/排序）+ ItemCardData 序列化层"
```

---

### Task 13: 首页瀑布流（RSC 首屏 + 零抖动 + 无限滚动）

**Files:**
- Create: `src/lib/waterfall.ts`、`src/hooks/useInfiniteItems.ts`
- Create: `src/components/item/ItemCard.tsx` · `WaterfallFeed.tsx` · `CategoryChips.tsx` · `SortSelect.tsx`
- Modify: `src/app/page.tsx`（全量替换脚手架首页）
- Test: `tests/lib/waterfall.test.ts`、`tests/components/item-card.test.tsx`

**Interfaces:**
- Consumes: T12 的 `queryItems/toItemCardData/ItemCardData`、T5 的组件、T4 的常量
- Produces:
  - `waterfallAppend(prev: WaterfallState<T> | null, entries: WaterfallEntry<T>[], columnCount): WaterfallState<T>`（纯函数：贪心分配到当前最矮列；`prev` 传入则增量追加——**已放置的商品永不移动**）
  - `ratioOf(image?: { width; height }): number`（列高估算 = 高/宽 + 0.62 卡身常数）
  - `useInfiniteItems(initial, query, pageSize=12)` → `{ columns, columnCount, sentinelRef, loading, hasMore, retry }`；首帧前按 `innerWidth` 决定 3 列（≥1024）或 2 列
  - `ItemCard({ item: ItemCardData })`：`aspect-ratio` 占位（宽高来自库中数据 → **零布局抖动**）、`loading="lazy"`、非在售状态角标、"可小刀"标、卖家认证徽章、楼栋地点
  - 首页 RSC 直出第一页（SEO + 首屏快），滚动加载调 T12 的 `/api/items`

- [ ] **Step 1: 写瀑布流纯函数测试**

`tests/lib/waterfall.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { ratioOf, waterfallAppend } from '@/lib/waterfall'

const e = (id: string, ratio: number) => ({ item: id, ratio })

describe('waterfallAppend', () => {
  it('前几个商品依次落入各列（列高平衡）', () => {
    const { columns } = waterfallAppend(null, [e('a', 1), e('b', 1), e('c', 1), e('d', 1)], 3)
    expect(columns).toEqual([['a', 'd'], ['b'], ['c']])
  })

  it('矮列优先：高比例商品后的下一个进入最矮列', () => {
    const { columns } = waterfallAppend(null, [e('tall', 3), e('x', 1), e('y', 1)], 2)
    expect(columns).toEqual([['tall'], ['x', 'y']])
  })

  it('增量追加不移动已有商品', () => {
    const first = waterfallAppend(null, [e('a', 2), e('b', 1)], 2)
    const second = waterfallAppend(first, [e('c', 1)], 2)
    expect(second.columns[0][0]).toBe('a')
    expect(second.columns[1]).toEqual(['b', 'c'])
  })

  it('ratioOf：无图回退 1:1 + 卡身常数', () => {
    expect(ratioOf(undefined)).toBeCloseTo(1.62)
    expect(ratioOf({ width: 800, height: 600 })).toBeCloseTo(0.75 + 0.62)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

预期：FAIL，模块不存在。

- [ ] **Step 3: 实现 src/lib/waterfall.ts**

```ts
export interface WaterfallEntry<T> {
  item: T
  /** 列高估算（相对卡宽的比例：封面高/宽 + 卡身常数） */
  ratio: number
}

export interface WaterfallState<T> {
  columns: T[][]
  heights: number[]
}

const CARD_BODY_RATIO = 0.62

export function ratioOf(image?: { width: number; height: number }): number {
  return (image ? image.height / image.width : 1) + CARD_BODY_RATIO
}

/** 贪心分配到当前最矮列。传入 prev 增量追加：已有商品的列归属不会改变 */
export function waterfallAppend<T>(
  prev: WaterfallState<T> | null,
  entries: WaterfallEntry<T>[],
  columnCount: number,
): WaterfallState<T> {
  const columns: T[][] = prev
    ? prev.columns.map((col) => [...col])
    : Array.from({ length: columnCount }, () => [])
  const heights: number[] = prev ? [...prev.heights] : Array.from({ length: columnCount }, () => 0)

  for (const entry of entries) {
    let min = 0
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] < heights[min]) min = i
    }
    columns[min].push(entry.item)
    heights[min] += entry.ratio
  }
  return { columns, heights }
}
```

- [ ] **Step 4: 运行确认纯函数测试通过**

```bash
npm test
```

- [ ] **Step 5: 实现 ItemCard（含 RTL 测试）**

`tests/components/item-card.test.tsx`：

```tsx
/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ItemCard } from '@/components/item/ItemCard'
import type { ItemCardData } from '@/lib/items'

const base: ItemCardData = {
  id: 'i1',
  title: '《数据结构》严蔚敏 九成新',
  priceCents: 1500,
  negotiable: true,
  location: '东区3号楼',
  status: 'ON_SALE',
  cover: { url: '/uploads/2026/a.webp', width: 800, height: 600 },
  seller: { id: 'u1', username: '小鹿', avatarUrl: null, verifiedAt: '2026-10-01T00:00:00.000Z' },
}

describe('ItemCard', () => {
  it('渲染价格、可小刀、认证徽章、地点，链接指向详情页', () => {
    render(<ItemCard item={base} />)
    expect(screen.getByText('¥15')).toBeInTheDocument()
    expect(screen.getByText('可小刀')).toBeInTheDocument()
    expect(screen.getByText('已认证')).toBeInTheDocument()
    expect(screen.getByText('东区3号楼')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/items/i1')
  })

  it('封面按库中宽高设 aspect-ratio（零抖动占位）', () => {
    render(<ItemCard item={base} />)
    const holder = screen.getByTestId('item-cover')
    expect(holder).toHaveStyle({ aspectRatio: '800 / 600' })
  })

  it('已售出商品显示角标', () => {
    render(<ItemCard item={{ ...base, status: 'SOLD' }} />)
    expect(screen.getByText('已售出')).toBeInTheDocument()
  })
})
```

`src/components/item/ItemCard.tsx`：

```tsx
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { StatusBadge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import type { ItemCardData } from '@/lib/items'
import { formatPrice } from '@/lib/format'

export function ItemCard({ item }: { item: ItemCardData }) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="block overflow-hidden rounded-card bg-surface shadow-card transition hover:shadow-[0_6px_20px_rgba(20,40,80,.13)]"
    >
      <div
        data-testid="item-cover"
        className="relative w-full overflow-hidden bg-[#e8edf3]"
        style={{ aspectRatio: item.cover ? `${item.cover.width} / ${item.cover.height}` : '1 / 1' }}
      >
        {item.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover.url} alt={item.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {item.status !== 'ON_SALE' && <StatusBadge status={item.status} className="absolute left-2 top-2" />}
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-sm leading-snug">{item.title}</p>
        <p className="text-base font-extrabold text-price">
          {formatPrice(item.priceCents)}
          {item.negotiable && <span className="ml-1.5 text-xs font-medium text-muted">可小刀</span>}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Avatar src={item.seller.avatarUrl} name={item.seller.username} size={16} />
          <span className="max-w-20 truncate">{item.seller.username}</span>
          {item.seller.verifiedAt && <span className="shrink-0 font-medium text-brand">已认证</span>}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <Icon name="location" size={12} />
            {item.location}
          </span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 6: 实现无限滚动 hook**

`src/hooks/useInfiniteItems.ts`：

```ts
'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { ItemCardData } from '@/lib/items'
import { ratioOf, waterfallAppend, type WaterfallState } from '@/lib/waterfall'

interface FeedQuery {
  category?: string
  q?: string
  sort?: string
}

function toEntries(items: ItemCardData[]) {
  return items.map((item) => ({ item, ratio: ratioOf(item.cover ?? undefined) }))
}

export function useInfiniteItems(
  initial: { items: ItemCardData[]; nextCursor: string | null },
  query: FeedQuery,
  pageSize = 12,
) {
  const toast = useToast()
  const allItemsRef = useRef<ItemCardData[]>(initial.items)
  const [columnCount, setColumnCount] = useState(3)
  const columnCountRef = useRef(3)
  const [state, setState] = useState<WaterfallState<ItemCardData>>(() =>
    waterfallAppend(null, toEntries(initial.items), 3),
  )
  const [nextCursor, setNextCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 首帧绘制前按屏幕宽度重排（SSR 默认 3 列；<1024 换 2 列，不闪动）
  useLayoutEffect(() => {
    const count = window.innerWidth >= 1024 ? 3 : 2
    if (count !== columnCountRef.current) {
      columnCountRef.current = count
      setColumnCount(count)
      setState(waterfallAppend(null, toEntries(allItemsRef.current), count))
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loading || !nextCursor) return
    setLoading(true)
    try {
      const search = new URLSearchParams({ cursor: nextCursor, limit: String(pageSize) })
      if (query.q) search.set('q', query.q)
      if (query.category) search.set('category', query.category)
      if (query.sort) search.set('sort', query.sort)
      const res = await fetch(`/api/items?${search.toString()}`)
      if (!res.ok) throw new Error('load failed')
      const data: { items: ItemCardData[]; nextCursor: string | null } = await res.json()
      allItemsRef.current = [...allItemsRef.current, ...data.items]
      setState((prev) => waterfallAppend(prev, toEntries(data.items), columnCountRef.current))
      setNextCursor(data.nextCursor)
    } catch {
      toast.error('加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [loading, nextCursor, query.q, query.category, query.sort, pageSize, toast])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !nextCursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, nextCursor])

  return { columns: state.columns, columnCount, sentinelRef, loading, hasMore: nextCursor !== null }
}
```

- [ ] **Step 7: 实现 Feed / Chips / SortSelect 与首页**

`src/components/item/WaterfallFeed.tsx`：

```tsx
'use client'

import { ItemCard } from '@/components/item/ItemCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { useInfiniteItems } from '@/hooks/useInfiniteItems'
import type { ItemCardData } from '@/lib/items'

export function WaterfallFeed({
  initial,
  query,
}: {
  initial: { items: ItemCardData[]; nextCursor: string | null }
  query: { category?: string; q?: string; sort?: string }
}) {
  const { columns, columnCount, sentinelRef, loading, hasMore } = useInfiniteItems(initial, query)
  return (
    <div>
      <div
        className="grid items-start gap-3"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {columns.map((column, index) => (
          <div key={index} className="flex flex-col gap-3">
            {column.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loading && <Skeleton className="h-8 w-40" />}
        </div>
      ) : (
        initial.items.length > 0 && <p className="py-6 text-center text-xs text-muted">没有更多啦</p>
      )}
    </div>
  )
}
```

`src/components/item/CategoryChips.tsx`：

```tsx
import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/constants'

export function CategoryChips({ active, q, sort }: { active?: string; q?: string; sort?: string }) {
  const href = (category?: string) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (q) params.set('q', q)
    if (sort && sort !== 'latest') params.set('sort', sort)
    const s = params.toString()
    return s ? `/?${s}` : '/'
  }
  const chipClass = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      on ? 'bg-brand text-white' : 'bg-white text-muted shadow-card hover:text-ink'
    }`
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      <Link href={href()} className={chipClass(!active)}>全部</Link>
      {CATEGORIES.map((category) => (
        <Link key={category} href={href(category)} className={chipClass(active === category)}>
          {CATEGORY_LABELS[category]}
        </Link>
      ))}
    </nav>
  )
}
```

`src/components/item/SortSelect.tsx`：

```tsx
'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function SortSelect({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <select
      aria-label="排序方式"
      value={value}
      onChange={(event) => {
        const params = new URLSearchParams(searchParams)
        if (event.target.value === 'latest') params.delete('sort')
        else params.set('sort', event.target.value)
        const s = params.toString()
        router.push(s ? `${pathname}?${s}` : pathname)
      }}
      className="rounded-btn border border-line bg-white px-2.5 py-1.5 text-sm text-muted outline-none focus:border-brand"
    >
      <option value="latest">最新发布</option>
      <option value="price_asc">价格从低到高</option>
      <option value="price_desc">价格从高到低</option>
    </select>
  )
}
```

`src/app/page.tsx` 全量替换：

```tsx
import { Suspense } from 'react'
import { CategoryChips } from '@/components/item/CategoryChips'
import { SortSelect } from '@/components/item/SortSelect'
import { WaterfallFeed } from '@/components/item/WaterfallFeed'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ItemSort } from '@/lib/items'
import { queryItems, toItemCardData } from '@/lib/items'

const PAGE_SIZE = 12

function parseSort(value?: string): ItemSort {
  return value === 'price_asc' || value === 'price_desc' ? value : 'latest'
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>
}) {
  const params = await searchParams
  const q = params.q?.trim() || undefined
  const sort = parseSort(params.sort)
  const { items, nextCursor } = await queryItems({ q, category: params.category, sort, limit: PAGE_SIZE })

  return (
    <div>
      <CategoryChips active={params.category} q={q} sort={sort} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {q ? `「${q}」的搜索结果（${items.length}${nextCursor ? '+' : ''} 件）` : '同学们正在出闲置'}
        </p>
        <Suspense>
          <SortSelect value={sort} />
        </Suspense>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={q ? '没有找到相关商品' : '还没有商品'}
          description={q ? '换个关键词试试，或者去发布求购' : '去发布第一件闲置吧'}
        />
      ) : (
        <WaterfallFeed
          initial={{ items: items.map(toItemCardData), nextCursor }}
          query={{ q, category: params.category, sort }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8: 运行测试 + 手动验证**

```bash
npm test
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000 | grep -o "同学们正在出闲置" | head -1
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：测试 PASS；curl 输出 `同学们正在出闲置`。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat: 首页瀑布流（服务端占位零抖动 + 贪心分列无限滚动 + 分类/排序）"
```

### Task 14: 商品详情页 + 公开留言

**Files:**
- Create: `src/lib/comments.ts`（序列化与公共 include）
- Create: `src/app/items/[id]/page.tsx`（RSC，含 viewCount+1）
- Create: `src/app/api/items/[id]/comments/route.ts`（POST）
- Create: `src/components/item-detail/ImageCarousel.tsx` · `SellerCard.tsx` · `CommentSection.tsx`
- Test: `tests/api/comments.test.ts`、`tests/components/comment-section.test.tsx`

**Interfaces:**
- Consumes: T12 `toItemCardData` 同款序列化思路、T5 组件、T6 守卫、T4 `commentSchema`
- Produces:
  - `CommentData = { id, content, createdAt: string, author: { id, username, avatarUrl, verifiedAt: string|null } }`
  - `commentInclude` 与 `toCommentData(row)`（`src/lib/comments.ts`）
  - `POST /api/items/[id]/comments` → 200 `{ comment: CommentData }`；未登录 401；空/超长 400；商品不存在 404
  - `ImageCarousel({ images })`：客户端轮播（主图 + 缩略图切换，`aspectRatio` 占位）
  - `SellerCard({ seller })`：头像 / 昵称 / 认证徽章 / 信誉分（`ratingAvg.toFixed(1)`，0 显示「暂无评价」）/ 成交数
  - `CommentSection({ itemId, initialComments, currentUser })`：**所有内容按纯文本渲染（Review Focus #4）**；未登录显示登录引导
  - 详情页中「收藏」与「聊一聊」按钮本任务先渲染为 `disabled` 占位（T15 / T19 替换）

- [ ] **Step 1: 写留言 API 测试**

`tests/api/comments.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { POST as commentPOST } from '@/app/api/items/[id]/comments/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedItem() {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '《数据结构》九成新', description: '东区交易，无笔记。', priceCents: 1500,
      category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区3号楼', sellerId: seller.id,
    },
  })
  return { seller, item }
}

const call = (id: string, token: string | null, body: unknown) =>
  commentPOST(
    reqWithCookie(`http://t/api/items/${id}/comments`, token, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  )

describe('POST /api/items/[id]/comments', () => {
  beforeEach(resetDb)

  it('登录用户留言成功并返回作者信息', async () => {
    const { item } = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await call(item.id, token, { content: '同学，还在吗？' })
    expect(res.status).toBe(200)
    const { comment } = await res.json()
    expect(comment.content).toBe('同学，还在吗？')
    expect(comment.author.username).toBe(u.username)
    expect(await prisma.comment.count({ where: { itemId: item.id } })).toBe(1)
  })

  it('未登录 → 401；空内容 → 400', async () => {
    const { item } = await seedItem()
    expect((await call(item.id, null, { content: 'hi' })).status).toBe(401)
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    expect((await call(item.id, token, { content: '   ' })).status).toBe(400)
  })

  it('商品不存在 → 404', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    expect((await call('no-such-id', token, { content: '你好呀' })).status).toBe(404)
  })

  it('HTML 原样入库（渲染端负责转义，不在这里做清洗）', async () => {
    const { item } = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const evil = '<img src=x onerror="alert(1)">'
    await call(item.id, token, { content: evil })
    const row = await prisma.comment.findFirstOrThrow({ where: { itemId: item.id } })
    expect(row.content).toBe(evil)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

预期：FAIL（路由不存在）。

- [ ] **Step 3: 实现 src/lib/comments.ts 与留言路由**

`src/lib/comments.ts`：

```ts
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export const commentInclude = {
  author: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } },
} satisfies Prisma.CommentInclude

export interface CommentData {
  id: string
  content: string
  createdAt: string
  author: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
}

type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>

export function toCommentData(row: CommentRow): CommentData {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.author.id,
      username: row.author.username,
      avatarUrl: row.author.avatarUrl,
      verifiedAt: row.author.verifiedAt ? row.author.verifiedAt.toISOString() : null,
    },
  }
}

export async function queryComments(itemId: string, take = 50) {
  return prisma.comment.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    take,
    include: commentInclude,
  })
}
```

`src/app/api/items/[id]/comments/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { commentInclude, toCommentData } from '@/lib/comments'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { commentSchema } from '@/lib/validators'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    const item = await prisma.item.findUnique({ where: { id }, select: { id: true } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')

    const { content } = commentSchema.parse(await readJson(req))
    const comment = await prisma.comment.create({
      data: { itemId: id, authorId: user.id, content },
      include: commentInclude,
    })
    return NextResponse.json({ comment: toCommentData(comment) })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 4: 运行确认留言 API 测试通过**

```bash
npm test
```

- [ ] **Step 5: 写 CommentSection 组件与 XSS 测试**

`tests/components/comment-section.test.tsx`：

```tsx
/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentSection } from '@/components/item-detail/CommentSection'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/items/i1',
}))

const comment = (content: string) => ({
  id: 'c1', content, createdAt: '2026-10-16T10:00:00.000Z',
  author: { id: 'u1', username: '小鹿', avatarUrl: null, verifiedAt: null },
})

describe('CommentSection', () => {
  it('HTML 按纯文本渲染，不产生可执行节点（Review Focus #4）', () => {
    const evil = '<img src=x onerror="alert(1)">'
    render(
      <ToastProvider>
        <CommentSection itemId="i1" initialComments={[comment(evil)]} currentUser={{ id: 'u2', username: '我', avatarUrl: null }} />
      </ToastProvider>,
    )
    expect(screen.getByText(evil)).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('未登录显示登录引导，不显示输入框', () => {
    render(
      <ToastProvider>
        <CommentSection itemId="i1" initialComments={[]} currentUser={null} />
      </ToastProvider>,
    )
    expect(screen.getByText(/登录后可留言/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
```

- [ ] **Step 6: 实现三个详情页组件**

`src/components/item-detail/ImageCarousel.tsx`：

```tsx
'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

interface CarouselImage { url: string; width: number; height: number }

export function ImageCarousel({ images }: { images: CarouselImage[] }) {
  const [index, setIndex] = useState(0)
  const current = images[index]
  if (!current) return <div className="aspect-square rounded-card bg-[#e8edf3]" />
  return (
    <div>
      <div className="relative overflow-hidden rounded-card bg-[#e8edf3]" style={{ aspectRatio: `${current.width} / ${current.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {images.length > 1 && (
          <>
            <button type="button" aria-label="上一张"
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white hover:bg-black/55">
              <Icon name="close" size={14} className="rotate-45" />
            </button>
            <button type="button" aria-label="下一张"
              onClick={() => setIndex((i) => (i + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white hover:bg-black/55">
              <Icon name="close" size={14} className="-rotate-45" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button key={image.url} type="button" onClick={() => setIndex(i)}
              className={`size-14 shrink-0 overflow-hidden rounded-btn border-2 ${i === index ? 'border-brand' : 'border-transparent'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

`src/components/item-detail/SellerCard.tsx`：

```tsx
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'

interface SellerCardProps {
  seller: {
    id: string
    username: string
    avatarUrl: string | null
    verifiedAt: Date | string | null
    ratingAvg: number
    ratingCount: number
    soldCount: number
  }
}

export function SellerCard({ seller }: SellerCardProps) {
  return (
    <Link href={`/users/${seller.id}`} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card transition hover:shadow-[0_6px_20px_rgba(20,40,80,.13)]">
      <Avatar src={seller.avatarUrl} name={seller.username} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{seller.username}</span>
          {seller.verifiedAt && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#e6f6f1] px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
              <Icon name="shield" size={10} />已认证
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {seller.ratingCount > 0 ? (
            <span className="text-[#f5a623]">
              {'★'.repeat(Math.round(seller.ratingAvg))} {seller.ratingAvg.toFixed(1)}
            </span>
          ) : (
            '暂无评价'
          )}
          <span className="ml-2">成交 {seller.soldCount} 单</span>
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted">主页 ›</span>
    </Link>
  )
}
```

`src/components/item-detail/CommentSection.tsx`：

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useApi } from '@/lib/client-api'
import type { CommentData } from '@/lib/comments'
import { formatRelativeTime } from '@/lib/format'

export function CommentSection({
  itemId,
  initialComments,
  currentUser,
}: {
  itemId: string
  initialComments: CommentData[]
  currentUser: { id: string; username: string; avatarUrl: string | null } | null
}) {
  const { request } = useApi()
  const [comments, setComments] = useState(initialComments)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!content.trim() || loading) return
    setLoading(true)
    const result = await request<{ comment: CommentData }>(`/api/items/${itemId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
    setLoading(false)
    if (result.ok) {
      setComments((prev) => [result.data.comment, ...prev])
      setContent('')
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">留言（{comments.length}）</h2>
      {currentUser ? (
        <div className="mb-4">
          <Textarea
            name="comment"
            rows={3}
            maxLength={500}
            placeholder="问点什么，比如「还在吗」「能便宜点吗」"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} loading={loading} disabled={!content.trim()}>发布留言</Button>
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-card bg-surface p-3 text-sm text-muted shadow-card">
          <Link href="/login" className="font-semibold text-brand">登录</Link>后可留言
        </p>
      )}
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-2.5 rounded-card bg-surface p-3 shadow-card">
            <Avatar src={comment.author.avatarUrl} name={comment.author.username} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {comment.author.username}
                {comment.author.verifiedAt && <span className="ml-1 font-medium text-brand">已认证</span>}
                <span className="ml-2">{formatRelativeTime(comment.createdAt)}</span>
              </p>
              {/* 纯文本渲染：React 默认转义，禁止 dangerouslySetInnerHTML */}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
            </div>
          </li>
        ))}
      </ul>
      {comments.length === 0 && <p className="text-sm text-muted">还没有留言，来问第一句吧。</p>}
    </section>
  )
}
```

- [ ] **Step 7: 实现详情页（RSC）**

`src/app/items/[id]/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CommentSection } from '@/components/item-detail/CommentSection'
import { ImageCarousel } from '@/components/item-detail/ImageCarousel'
import { SellerCard } from '@/components/item-detail/SellerCard'
import { StatusBadge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { getSessionUser } from '@/lib/auth'
import { queryComments, toCommentData } from '@/lib/comments'
import { CONDITION_LABELS, CATEGORY_LABELS, type Category, type Condition } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { formatPrice, formatRelativeTime } from '@/lib/format'

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser((await cookies()).toString())

  const item = await prisma.item
    .update({
      where: { id },
      data: { viewCount: { increment: 1 } }, // 浏览量 +1（含本次返回）
      include: {
        images: { orderBy: { sort: 'asc' } },
        seller: true,
      },
    })
    .catch(() => null)
  if (!item) notFound()

  const comments = await queryComments(item.id)
  const currentUser = user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl } : null

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <ImageCarousel images={item.images.map(({ url, width, height }) => ({ url, width, height }))} />
        <CommentSection itemId={item.id} initialComments={comments.map(toCommentData)} currentUser={currentUser} />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-bold leading-snug">{item.title}</h1>
            <StatusBadge status={item.status as never} />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-price">
            {formatPrice(item.priceCents)}
            {item.negotiable && <span className="ml-2 text-xs font-medium text-muted">可小刀</span>}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>成色：{CONDITION_LABELS[item.condition as Condition]}</li>
            <li>分类：{CATEGORY_LABELS[item.category as Category]}</li>
            <li className="flex items-center gap-1"><Icon name="location" size={13} />{item.location}</li>
            <li className="flex items-center gap-1"><Icon name="eye" size={13} />{item.viewCount} 次浏览 · {formatRelativeTime(item.createdAt)}发布</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled className="flex-1 rounded-btn border border-line bg-white px-3 py-2 text-sm font-semibold text-muted opacity-60">
              <Icon name="heart" size={15} className="mr-1 inline" />收藏
            </button>
            <button type="button" disabled className="flex-1 rounded-btn bg-brand px-3 py-2 text-sm font-semibold text-white opacity-60">
              <Icon name="chat" size={15} className="mr-1 inline" />聊一聊
            </button>
          </div>
        </div>
        <SellerCard seller={item.seller} />
        <div className="rounded-card bg-surface p-4 shadow-card">
          <h2 className="mb-2 text-sm font-bold">商品描述</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90">{item.description}</p>
        </div>
      </div>
    </div>
  )
}
```

（`StatusBadge status={item.status as never}` 里 `as never` 换成 `as ItemStatus` 更干净——从 `@/lib/constants` 导入类型即可。）

- [ ] **Step 8: 运行测试 + 手动验证 + 提交**

```bash
npm test
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000/items/not-exist | grep -o "404" | head -1
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：测试 PASS；不存在的商品返回 404 页面。

```bash
git add -A
git commit -m "feat: 商品详情页（轮播/卖家卡/浏览计数）+ 公开留言（纯文本渲染）"
```

---

### Task 15: 收藏与浏览历史

**Files:**
- Create: `src/app/api/items/[id]/favorite/route.ts`（PUT / DELETE）
- Create: `src/components/item-detail/FavoriteButton.tsx`
- Modify: `src/app/items/[id]/page.tsx`（浏览历史 upsert + 收藏状态 + 挂 FavoriteButton）
- Test: `tests/api/favorite.test.ts`、`tests/components/favorite-button.test.tsx`

**Interfaces:**
- Consumes: T6 守卫、T3 prisma
- Produces:
  - `PUT /api/items/[id]/favorite` → 200 `{ favorited: true, favoriteCount: number }`（**重复 PUT 幂等**，Review Focus #1）
  - `DELETE /api/items/[id]/favorite` → 200 `{ favorited: false, favoriteCount: number }`（重复 DELETE 幂等）
  - `FavoriteButton({ itemId, initialFavorited, initialCount, isLoggedIn })`：乐观切换，失败回滚
  - 详情页：登录用户访问时 upsert `ViewHistory`（fire-and-forget，不阻塞渲染）

- [ ] **Step 1: 写失败测试（含幂等，Review Focus #1）**

`tests/api/favorite.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE, PUT } from '@/app/api/items/[id]/favorite/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedItem() {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '捷安特ATX通勤车', description: '八八成新，车况良好。', priceCents: 26000,
      category: 'TRANSPORT', condition: 'LIKE_NEW_80', location: '西区车棚', sellerId: seller.id,
    },
  })
  return item
}

const call = (method: 'PUT' | 'DELETE', id: string, token: string | null) =>
  (method === 'PUT' ? PUT : DELETE)(
    reqWithCookie(`http://t/api/items/${id}/favorite`, token, { method }),
    { params: Promise.resolve({ id }) },
  )

describe('收藏接口', () => {
  beforeEach(resetDb)

  it('PUT 收藏成功：返回 favorited 与 favoriteCount=1', async () => {
    const item = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    const res = await call('PUT', item.id, token)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ favorited: true, favoriteCount: 1 })
    const fresh = await prisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(fresh.favoriteCount).toBe(1)
  })

  it('重复 PUT 幂等：仍是 200，计数不重复加（Review Focus #1）', async () => {
    const item = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    await call('PUT', item.id, token)
    const res = await call('PUT', item.id, token)
    expect(res.status).toBe(200)
    expect((await res.json()).favoriteCount).toBe(1)
    expect(await prisma.favorite.count()).toBe(1)
  })

  it('DELETE 取消收藏；重复 DELETE 幂等且计数不为负', async () => {
    const item = await seedItem()
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    await call('PUT', item.id, token)
    expect(await (await call('DELETE', item.id, token)).json()).toEqual({ favorited: false, favoriteCount: 0 })
    expect(await (await call('DELETE', item.id, token)).json()).toEqual({ favorited: false, favoriteCount: 0 })
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).favoriteCount).toBe(0)
  })

  it('未登录 → 401', async () => {
    const item = await seedItem()
    expect((await call('PUT', item.id, null)).status).toBe(401)
  })

  it('商品不存在 → 404', async () => {
    const u = await createTestUser()
    const token = await createTestSession(u.id)
    expect((await call('PUT', 'nope', token)).status).toBe(404)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

- [ ] **Step 3: 实现收藏路由**

`src/app/api/items/[id]/favorite/route.ts`：

```ts
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'

async function ensureItemExists(id: string): Promise<void> {
  const item = await prisma.item.findUnique({ where: { id }, select: { id: true } })
  if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    await ensureItemExists(id)

    try {
      await prisma.$transaction([
        prisma.favorite.create({ data: { userId: user.id, itemId: id } }),
        prisma.item.update({ where: { id }, data: { favoriteCount: { increment: 1 } } }),
      ])
    } catch (err) {
      // 已收藏（唯一约束冲突）→ 幂等成功，不加计数
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    }

    const item = await prisma.item.findUniqueOrThrow({ where: { id }, select: { favoriteCount: true } })
    return NextResponse.json({ favorited: true, favoriteCount: item.favoriteCount })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    await ensureItemExists(id)

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.favorite.deleteMany({ where: { userId: user.id, itemId: id } })
      if (deleted.count > 0) {
        await tx.item.update({ where: { id }, data: { favoriteCount: { decrement: 1 } } })
      }
    })

    const item = await prisma.item.findUniqueOrThrow({ where: { id }, select: { favoriteCount: true } })
    return NextResponse.json({ favorited: false, favoriteCount: item.favoriteCount })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 4: 实现 FavoriteButton 与其测试**

`tests/components/favorite-button.test.tsx`：

```tsx
/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FavoriteButton } from '@/components/item-detail/FavoriteButton'
import { ToastProvider } from '@/components/ui/Toast'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/items/i1',
}))

describe('FavoriteButton', () => {
  beforeEach(() => pushMock.mockClear())

  it('点击后乐观变为已收藏，服务端确认后计数更新', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ favorited: true, favoriteCount: 8 }), { status: 200 }),
    ))
    render(<ToastProvider><FavoriteButton itemId="i1" initialFavorited={false} initialCount={7} isLoggedIn /></ToastProvider>)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/想要 8/)).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/items/i1/favorite', expect.objectContaining({ method: 'PUT' })))
  })

  it('未登录时点击跳转登录页', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<ToastProvider><FavoriteButton itemId="i1" initialFavorited={false} initialCount={0} isLoggedIn={false} /></ToastProvider>)
    await userEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fitems%2Fi1')
  })
})
```

`src/components/item-detail/FavoriteButton.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useApi } from '@/lib/client-api'

export function FavoriteButton({
  itemId,
  initialFavorited,
  initialCount,
  isLoggedIn,
}: {
  itemId: string
  initialFavorited: boolean
  initialCount: number
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const { request } = useApi()
  const [favorited, setFavorited] = useState(initialFavorited)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/items/${itemId}`)}`)
      return
    }
    if (loading) return
    setLoading(true)
    const next = !favorited
    setFavorited(next) // 乐观
    setCount((c) => c + (next ? 1 : -1))
    const result = await request<{ favorited: boolean; favoriteCount: number }>(`/api/items/${itemId}/favorite`, {
      method: next ? 'PUT' : 'DELETE',
    })
    setLoading(false)
    if (result.ok) {
      setFavorited(result.data.favorited)
      setCount(result.data.favoriteCount)
    } else {
      setFavorited(!next) // 回滚
      setCount((c) => c + (next ? -1 : 1))
    }
  }

  return (
    <Button variant={favorited ? 'secondary' : 'secondary'} onClick={toggle} className="flex-1">
      <Icon name={favorited ? 'heartFilled' : 'heart'} size={15} className={favorited ? 'text-price' : ''} />
      {favorited ? '已收藏' : '想要'} {count}
    </Button>
  )
}
```

- [ ] **Step 5: 接入详情页（替换占位收藏按钮 + 浏览历史）**

修改 `src/app/items/[id]/page.tsx`：

1）在文件顶部 import 增加：

```ts
import { FavoriteButton } from '@/components/item-detail/FavoriteButton'
```

2）在取到 `user` 与 `item` 之后插入：

```ts
  if (user) {
    // 浏览历史：重复浏览只更新时间（fire-and-forget，不阻塞渲染）
    void prisma.viewHistory
      .upsert({
        where: { userId_itemId: { userId: user.id, itemId: item.id } },
        create: { userId: user.id, itemId: item.id },
        update: { viewedAt: new Date() },
      })
      .catch(() => {})
  }
  const favorited = user
    ? Boolean(await prisma.favorite.findUnique({ where: { userId_itemId: { userId: user.id, itemId: item.id } } }))
    : false
```

3）把占位的收藏 `<button disabled>` 替换为：

```tsx
            <FavoriteButton
              itemId={item.id}
              initialFavorited={favorited}
              initialCount={item.favoriteCount}
              isLoggedIn={Boolean(user)}
            />
```

（「聊一聊」按钮保持占位，T19 替换。）

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test
```

预期：收藏 API（含两处幂等）+ FavoriteButton 测试全 PASS。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 收藏（PUT/DELETE 幂等 + 乐观 UI）与浏览历史记录"
```

### Task 16: 发布 / 编辑商品 + 我的发布（状态操作）

**Files:**
- Modify: `src/lib/validators.ts`（追加 `statusActionSchema`）
- Create: `src/app/api/items/[id]/route.ts`（PATCH 编辑）
- Create: `src/app/api/items/[id]/status/route.ts`（PATCH 状态流转）
- Create: `src/components/publish/PublishForm.tsx`（发布与编辑共用）
- Create: `src/app/publish/page.tsx` · `src/app/items/[id]/edit/page.tsx`
- Create: `src/app/me/page.tsx` · `src/components/me/ItemStatusActions.tsx` · `src/components/me/LogoutButton.tsx`
- Test: `tests/api/item-manage.test.ts`

**Interfaces:**
- Consumes: T11 的 `canTransition/applyTransition`、T10 的 `/api/upload`、T4 的 `parseItemInput`
- Produces:
  - `statusActionSchema`（validators.ts 追加）：`{action:'RESERVE'|'UNRESERVE'|'DELIST'|'RELIST'} | {action:'MARK_SOLD', buyerId: string}`
  - `PATCH /api/items/[id]`（编辑）→ 200 `{item:{id}}`；**非本人 403；状态不是 ON_SALE/RESERVED 时 403（Review Focus #2）**
  - `PATCH /api/items/[id]/status` → 200 `{item:{id,status}}`；状态机拒绝 → 403（原因文案来自 `canTransition`）；MARK_SOLD 的 buyerId 必须来自该商品会话，否则 400
  - 「标记已售」事务：写 `buyerId/soldAt` + **卖家** `soldCount+1`（修正 Spec §5.7 的「双方」措辞：soldCount 只会展示在卖家信誉上，对买家无意义）
  - `PublishForm({ initial?, itemId? })`：itemId 存在 → PATCH 编辑模式；图片先调 `/api/upload` 收集 `{url,width,height}`（**注意：multipart 请求不能带 `content-type: application/json`，这里用裸 fetch**，401 时 Toast + 跳登录）
  - `/me` 三个 tab（`?tab=published|favorites|history`）+ 退出登录；「我的发布」含状态操作按钮与买家选择

- [ ] **Step 1: validators 追加 statusActionSchema**

在 `src/lib/validators.ts` 末尾追加：

```ts
export const statusActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('RESERVE') }),
  z.object({ action: z.literal('UNRESERVE') }),
  z.object({ action: z.literal('DELIST') }),
  z.object({ action: z.literal('RELIST') }),
  z.object({ action: z.literal('MARK_SOLD'), buyerId: z.string().min(1, '请选择买家') }),
])
```

- [ ] **Step 2: 写失败测试**

`tests/api/item-manage.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as editPATCH } from '@/app/api/items/[id]/route'
import { PATCH as statusPATCH } from '@/app/api/items/[id]/status/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const editBody = {
  title: '《数据结构》严蔚敏 九成新（已降价）',
  description: '东区当面交易，无笔记，封面完好无损。',
  priceYuan: 12,
  negotiable: false,
  category: 'BOOKS',
  condition: 'LIKE_NEW_90',
  location: '东区3号楼',
  images: [{ url: '/uploads/2026/new.webp', width: 400, height: 300 }],
}

async function seedItem(overrides: Record<string, unknown> = {}) {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '《数据结构》九成新', description: '东区交易，无笔记。原价出。', priceCents: 1500,
      category: 'BOOKS', condition: 'LIKE_NEW_90', location: '东区3号楼', sellerId: seller.id,
      images: { create: [{ url: '/uploads/2026/a.webp', width: 800, height: 600, sort: 0 }] },
      ...overrides,
    },
  })
  return { seller, item }
}

const editCall = (id: string, token: string | null, body: unknown) =>
  editPATCH(reqWithCookie(`http://t/api/items/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

const statusCall = (id: string, token: string | null, body: unknown) =>
  statusPATCH(reqWithCookie(`http://t/api/items/${id}/status`, token, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe('PATCH /api/items/[id]（编辑）', () => {
  beforeEach(resetDb)

  it('卖家编辑成功：字段更新、图片整体替换', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    const res = await editCall(item.id, token, editBody)
    expect(res.status).toBe(200)
    const fresh = await prisma.item.findUniqueOrThrow({ where: { id: item.id }, include: { images: true } })
    expect(fresh.priceCents).toBe(1200)
    expect(fresh.images).toHaveLength(1)
    expect(fresh.images[0].url).toBe('/uploads/2026/new.webp')
  })

  it('已售出商品不可编辑 → 403（Review Focus #2）', async () => {
    const { seller, item } = await seedItem({ status: 'SOLD' })
    const token = await createTestSession(seller.id)
    expect((await editCall(item.id, token, editBody)).status).toBe(403)
  })

  it('非本人编辑 → 403', async () => {
    const { item } = await seedItem()
    const other = await createTestUser()
    const token = await createTestSession(other.id)
    expect((await editCall(item.id, token, editBody)).status).toBe(403)
  })
})

describe('PATCH /api/items/[id]/status（状态流转）', () => {
  beforeEach(resetDb)

  it('卖家预订 → RESERVED；路人预订 → 403', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    expect((await statusCall(item.id, token, { action: 'RESERVE' })).status).toBe(200)
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('RESERVED')

    const other = await createTestUser()
    const otherToken = await createTestSession(other.id)
    expect((await statusCall(item.id, otherToken, { action: 'UNRESERVE' })).status).toBe(403)
  })

  it('卖家下架 → delistedBy=USER，可重新上架', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    await statusCall(item.id, token, { action: 'DELIST' })
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).delistedBy).toBe('USER')
    expect((await statusCall(item.id, token, { action: 'RELIST' })).status).toBe(200)
    expect((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('ON_SALE')
  })

  it('管理员下架的商品卖家不能重新上架（Review Focus #2）', async () => {
    const { seller, item } = await seedItem({ status: 'DELISTED', delistedBy: 'ADMIN' })
    const token = await createTestSession(seller.id)
    const res = await statusCall(item.id, token, { action: 'RELIST' })
    expect(res.status).toBe(403)
  })

  it('标记已售：buyerId 必须来自该商品会话，成功后写 buyerId/soldAt 且卖家 soldCount+1', async () => {
    const { seller, item } = await seedItem()
    const buyer = await createTestUser()
    const token = await createTestSession(seller.id)

    // 没有会话时拒绝
    expect((await statusCall(item.id, token, { action: 'MARK_SOLD', buyerId: buyer.id })).status).toBe(400)

    await prisma.conversation.create({ data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id } })
    const res = await statusCall(item.id, token, { action: 'MARK_SOLD', buyerId: buyer.id })
    expect(res.status).toBe(200)
    const fresh = await prisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(fresh.status).toBe('SOLD')
    expect(fresh.buyerId).toBe(buyer.id)
    expect(fresh.soldAt).not.toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).soldCount).toBe(1)
  })

  it('SOLD 终态：任何操作都拒绝', async () => {
    const { seller, item } = await seedItem({ status: 'SOLD' })
    const token = await createTestSession(seller.id)
    expect((await statusCall(item.id, token, { action: 'DELIST' })).status).toBe(403)
    expect((await statusCall(item.id, token, { action: 'MARK_SOLD', buyerId: 'x' })).status).toBe(403)
  })
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npm test
```

预期：FAIL（两个路由不存在）。

- [ ] **Step 4: 实现编辑与状态流转路由**

`src/app/api/items/[id]/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { parseItemInput } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    const item = await prisma.item.findUnique({ where: { id }, select: { sellerId: true, status: true } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
    if (item.sellerId !== user.id) throw new ApiError('FORBIDDEN', '只能编辑自己的商品')
    if (item.status !== 'ON_SALE' && item.status !== 'RESERVED') {
      throw new ApiError('FORBIDDEN', '只有「在售」或「已预订」的商品可以编辑')
    }

    const input = parseItemInput(await readJson(req))
    await prisma.$transaction([
      prisma.item.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          priceCents: input.priceCents,
          negotiable: input.negotiable,
          category: input.category,
          condition: input.condition,
          location: input.location,
        },
      }),
      prisma.itemImage.deleteMany({ where: { itemId: id } }),
      prisma.itemImage.createMany({
        data: input.images.map((img, index) => ({ itemId: id, url: img.url, width: img.width, height: img.height, sort: index })),
      }),
    ])
    return NextResponse.json({ item: { id } })
  } catch (err) {
    return errorResponse(err)
  }
}
```

`src/app/api/items/[id]/status/route.ts`：

```ts
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { applyTransition, canTransition } from '@/lib/state-machine'
import { statusActionSchema } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    const input = statusActionSchema.parse(await readJson(req))

    const item = await prisma.item.findUnique({ where: { id }, include: { conversations: true } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')

    const isSeller = item.sellerId === user.id
    const actor = isSeller ? 'SELLER' : user.role === 'ADMIN' ? 'ADMIN' : 'OTHER'
    const status = item.status as ItemStatus
    const reason = canTransition(status, input.action, { actor, delistedBy: item.delistedBy })
    if (reason) throw new ApiError('FORBIDDEN', reason)

    if (input.action === 'MARK_SOLD') {
      const conversation = item.conversations.find((c) => c.buyerId === input.buyerId)
      if (!conversation) throw new ApiError('VALIDATION', '买家必须来自该商品的聊天会话', { buyerId: '没有与该买家的会话' })
      await prisma.$transaction([
        prisma.item.update({
          where: { id },
          data: { status: 'SOLD', buyerId: input.buyerId, soldAt: new Date() },
        }),
        prisma.user.update({ where: { id: item.sellerId }, data: { soldCount: { increment: 1 } } }),
      ])
      return NextResponse.json({ item: { id, status: 'SOLD' } })
    }

    const data: Prisma.ItemUpdateInput = { status: applyTransition(status, input.action) }
    if (input.action === 'DELIST') data.delistedBy = isSeller ? 'USER' : 'ADMIN'
    if (input.action === 'RELIST') data.delistedBy = null
    await prisma.item.update({ where: { id }, data })
    return NextResponse.json({ item: { id, status: data.status } })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 5: 运行确认测试通过**

```bash
npm test
```

- [ ] **Step 6: 实现 PublishForm（发布 / 编辑共用）**

`src/components/publish/PublishForm.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS } from '@/lib/constants'

interface StoredImage { url: string; width: number; height: number }

export interface PublishFormInitial {
  title: string
  description: string
  priceYuan: number
  negotiable: boolean
  category: string
  condition: string
  location: string
  images: StoredImage[]
}

export function PublishForm({ initial, itemId }: { initial?: PublishFormInitial; itemId?: string }) {
  const router = useRouter()
  const toast = useToast()
  const { request } = useApi()
  const [images, setImages] = useState<StoredImage[]>(initial?.images ?? [])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files).slice(0, 9 - images.length)) {
      const form = new FormData()
      form.append('file', file)
      // multipart 不能带 content-type: application/json，用裸 fetch
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (res.status === 401) {
        toast.error('登录已过期，请重新登录')
        router.push(`/login?next=${encodeURIComponent(itemId ? `/items/${itemId}/edit` : '/publish')}`)
        break
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error?.message ?? '图片上传失败')
        continue
      }
      const stored: StoredImage = await res.json()
      setImages((prev) => [...prev, stored])
    }
    setUploading(false)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    if (images.length === 0) {
      toast.error('请至少上传 1 张图片')
      return
    }
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      priceYuan: Number(form.get('price')),
      negotiable: form.get('negotiable') === 'on',
      category: form.get('category'),
      condition: form.get('condition'),
      location: form.get('location'),
      images,
    }
    const result = itemId
      ? await request<{ item: { id: string } }>(`/api/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await request<{ item: { id: string } }>('/api/items', { method: 'POST', body: JSON.stringify(payload) })
    setLoading(false)
    if (result.ok) {
      toast.success(itemId ? '已保存修改' : '发布成功')
      router.push(`/items/${result.data.item.id}`)
      router.refresh()
      return
    }
    if (result.fields) setFieldErrors(result.fields)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <span className="mb-1 block text-sm font-medium">商品图片（1–9 张，第一张为封面）</span>
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={image.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="size-20 rounded-btn object-cover" />
              {index === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1 text-[10px] text-white">封面</span>}
              <button type="button" aria-label="删除图片"
                onClick={() => setImages((prev) => prev.filter((i) => i.url !== image.url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white">
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
          {images.length < 9 && (
            <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-btn border border-dashed border-line bg-white text-xs text-muted hover:border-brand hover:text-brand">
              <Icon name={uploading ? 'image' : 'plus'} size={18} />
              {uploading ? '上传中' : '加图片'}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} />
            </label>
          )}
        </div>
        {fieldErrors.images && <p className="mt-1 text-xs text-[#d94f3d]">{fieldErrors.images}</p>}
      </div>

      <Input label="标题" name="title" required maxLength={60} defaultValue={initial?.title}
        placeholder="例如：《数据结构》严蔚敏 九成新" error={fieldErrors.title} />
      <Textarea label="描述" name="description" rows={5} required maxLength={2000} defaultValue={initial?.description}
        placeholder="成色细节、有无笔记、交易时间地点…" error={fieldErrors.description} />

      <div className="grid grid-cols-2 gap-4">
        <Input label="价格（元）" name="price" type="number" step="0.01" min="0.01" max="99999" required
          defaultValue={initial?.priceYuan} placeholder="15.00" error={fieldErrors.priceYuan} />
        <Input label="交易地点" name="location" required maxLength={40} defaultValue={initial?.location}
          placeholder="东区3号楼" error={fieldErrors.location} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">分类</span>
          <select name="category" defaultValue={initial?.category ?? 'BOOKS'}
            className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">成色</span>
          <select name="condition" defaultValue={initial?.condition ?? 'LIKE_NEW_90'}
            className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand">
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>{CONDITION_LABELS[condition]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="negotiable" defaultChecked={initial?.negotiable ?? true} className="size-4 accent-[#0fa47f]" />
        接受砍价（可小刀）
      </label>

      <Button type="submit" loading={loading} className="w-full">
        {itemId ? '保存修改' : '发布'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 7: 发布页 / 编辑页 / 我的页面**

`src/app/publish/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PublishForm } from '@/components/publish/PublishForm'
import { getSessionUser } from '@/lib/auth'

export default async function PublishPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fpublish')
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-extrabold">发布闲置</h1>
      <PublishForm />
    </div>
  )
}
```

`src/app/items/[id]/edit/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { PublishForm } from '@/components/publish/PublishForm'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect(`/login?next=${encodeURIComponent(`/items/${id}/edit`)}`)

  const item = await prisma.item.findUnique({ where: { id }, include: { images: { orderBy: { sort: 'asc' } } } })
  if (!item) notFound()
  if (item.sellerId !== user.id) redirect(`/items/${id}`)
  if (item.status !== 'ON_SALE' && item.status !== 'RESERVED') redirect(`/items/${id}`)

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-extrabold">编辑商品</h1>
      <PublishForm
        itemId={item.id}
        initial={{
          title: item.title,
          description: item.description,
          priceYuan: item.priceCents / 100,
          negotiable: item.negotiable,
          category: item.category,
          condition: item.condition,
          location: item.location,
          images: item.images.map(({ url, width, height }) => ({ url, width, height })),
        }}
      />
    </div>
  )
}
```

`src/components/me/LogoutButton.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'

export function LogoutButton() {
  const router = useRouter()
  const { request } = useApi()
  return (
    <Button variant="ghost" onClick={async () => {
      await request('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    }}>
      退出登录
    </Button>
  )
}
```

`src/components/me/ItemStatusActions.tsx`：

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'
import type { ItemStatus } from '@/lib/constants'
import { useRouter } from 'next/navigation'

export interface StatusActionBuyer { id: string; username: string }

export function ItemStatusActions({
  itemId,
  status,
  buyers,
}: {
  itemId: string
  status: ItemStatus
  buyers: StatusActionBuyer[]
}) {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)
  const [showSoldPanel, setShowSoldPanel] = useState(false)
  const [buyerId, setBuyerId] = useState(buyers[0]?.id ?? '')

  async function act(body: Record<string, unknown>) {
    setLoading(true)
    const result = await request(`/api/items/${itemId}/status`, { method: 'PATCH', body: JSON.stringify(body) })
    setLoading(false)
    if (result.ok) {
      setShowSoldPanel(false)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={`/items/${itemId}/edit`} className="text-muted hover:text-brand">编辑</Link>
      {status === 'ON_SALE' && <Button variant="secondary" onClick={() => act({ action: 'RESERVE' })} loading={loading}>标记已预订</Button>}
      {status === 'RESERVED' && <Button variant="secondary" onClick={() => act({ action: 'UNRESERVE' })} loading={loading}>取消预订</Button>}
      {(status === 'ON_SALE' || status === 'RESERVED') && (
        <>
          <Button variant="secondary" onClick={() => act({ action: 'DELIST' })} loading={loading}>下架</Button>
          {showSoldPanel ? (
            <span className="flex items-center gap-2">
              <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}
                className="rounded-btn border border-line bg-white px-2 py-1.5 text-sm">
                {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.username}</option>)}
              </select>
              <Button loading={loading} disabled={!buyerId} onClick={() => act({ action: 'MARK_SOLD', buyerId })}>确认售出</Button>
            </span>
          ) : (
            <Button onClick={() => setShowSoldPanel(true)} disabled={buyers.length === 0}
              title={buyers.length === 0 ? '还没有买家与你聊天，无法选择买家' : undefined}>
              标记已售
            </Button>
          )}
        </>
      )}
      {status === 'DELISTED' && <Button variant="secondary" onClick={() => act({ action: 'RELIST' })} loading={loading}>重新上架</Button>}
      {status === 'SOLD' && <span className="text-muted">已成交</span>}
    </div>
  )
}
```

`src/app/me/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemStatusActions } from '@/components/me/ItemStatusActions'
import { LogoutButton } from '@/components/me/LogoutButton'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { getSessionUser } from '@/lib/auth'
import { ITEM_STATUS_LABELS, type ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import { toItemCardData } from '@/lib/items'

const TABS = [
  { key: 'published', label: '我的发布' },
  { key: 'favorites', label: '我的收藏' },
  { key: 'history', label: '浏览历史' },
] as const

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'published'
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fme')

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{user.username} 的个人中心</h1>
        <div className="flex items-center gap-3">
          <Link href="/me/verification" className="text-sm font-semibold text-brand hover:text-brand-deep">
            {user.verifiedAt ? '✓ 已认证' : '学生认证'}
          </Link>
          <LogoutButton />
        </div>
      </div>

      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/me?tab=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-brand text-white' : 'bg-white text-muted shadow-card hover:text-ink'}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'published' && <PublishedTab userId={user.id} />}
      {tab === 'favorites' && <FavoritesTab userId={user.id} />}
      {tab === 'history' && <HistoryTab userId={user.id} />}
    </div>
  )
}

async function PublishedTab({ userId }: { userId: string }) {
  const items = await prisma.item.findMany({
    where: { sellerId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { sort: 'asc' }, take: 1 },
      conversations: { include: { buyer: { select: { id: true, username: true } } } },
    },
  })
  if (items.length === 0) {
    return <EmptyState title="还没有发布过商品" description="去发布第一件闲置吧" action={<Link className="text-brand font-semibold" href="/publish">发布闲置</Link>} />
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
          {item.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.images[0].url} alt="" className="size-16 rounded-btn object-cover" />
          ) : (
            <div className="size-16 rounded-btn bg-[#e8edf3]" />
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/items/${item.id}`} className="line-clamp-1 text-sm font-semibold hover:text-brand">{item.title}</Link>
            <p className="mt-0.5 text-sm font-bold text-price">{formatPrice(item.priceCents)}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <StatusBadge status={item.status as ItemStatus} />
              {formatRelativeTime(item.createdAt)}发布 · {item.viewCount} 次浏览
            </p>
          </div>
          <ItemStatusActions
            itemId={item.id}
            status={item.status as ItemStatus}
            buyers={item.conversations.map((c) => ({ id: c.buyer.id, username: c.buyer.username }))}
          />
        </li>
      ))}
    </ul>
  )
}

async function FavoritesTab({ userId }: { userId: string }) {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { item: { include: { images: { orderBy: { sort: 'asc' }, take: 1 }, seller: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } } } } },
  })
  if (favorites.length === 0) return <EmptyState title="还没有收藏" description="看到心仪的就点「想要」" />
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {favorites.map((favorite) => <ItemCard key={favorite.id} item={toItemCardData(favorite.item)} />)}
    </div>
  )
}

async function HistoryTab({ userId }: { userId: string }) {
  const history = await prisma.viewHistory.findMany({
    where: { userId },
    orderBy: { viewedAt: 'desc' },
    take: 50,
    include: { item: { include: { images: { orderBy: { sort: 'asc' }, take: 1 }, seller: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } } } } },
  })
  if (history.length === 0) return <EmptyState title="还没有浏览记录" />
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {history.map((entry) => <ItemCard key={entry.id} item={toItemCardData(entry.item)} />)}
    </div>
  )
}
```

- [ ] **Step 8: 运行测试 + 手动验证 + 提交**

```bash
npm test
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors -o /dev/null -w "%{http_code}" http://localhost:3000/publish
echo
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：测试 PASS；`/publish` 未登录访问返回 307（重定向登录页）。

```bash
git add -A
git commit -m "feat: 发布/编辑商品 + 我的发布（状态操作、选买家成交）+ 收藏/历史 tab + 退出登录"
```

### Task 17: 成交互评 + 用户主页

**Files:**
- Create: `src/app/api/items/[id]/reviews/route.ts`（POST）
- Create: `src/components/item-detail/ReviewSection.tsx`
- Modify: `src/app/items/[id]/page.tsx`（挂 ReviewSection + 查询评价）
- Create: `src/app/users/[id]/page.tsx`
- Test: `tests/api/reviews.test.ts`

**Interfaces:**
- Consumes: T16 的成交数据（`buyerId/soldAt`）、T12 的 `queryItems`、T4 的 `reviewSchema`
- Produces:
  - `ReviewData = { id, rating, content: string|null, createdAt: string, author: {id,username,avatarUrl} }`
  - `POST /api/items/[id]/reviews` → 200 `{review}`；非交易双方 403；未成交 403；**重复评价 409（Review Focus #1）**
  - 评价写入事务：create + 以 `aggregate` **重算**目标用户 `ratingAvg/ratingCount`（无漂移）
  - `ReviewSection({ itemId, canReview, targetName, myReview, reviews })`：成交后显示评价按钮/表单与评价列表
  - `/users/[id]`：资料头（头像/昵称/徽章/星级/成交数）+ `?tab=onsale|sold|reviews`

- [ ] **Step 1: 写失败的测试**

`tests/api/reviews.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { POST as reviewPOST } from '@/app/api/items/[id]/reviews/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedSoldItem() {
  const seller = await createTestUser()
  const buyer = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '雅马哈F310 民谣吉他', description: '带琴包，音色很好。', priceCents: 35000,
      category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '南区宿舍',
      sellerId: seller.id, buyerId: buyer.id, status: 'SOLD', soldAt: new Date(),
    },
  })
  return { seller, buyer, item }
}

const call = (id: string, token: string | null, body: unknown) =>
  reviewPOST(reqWithCookie(`http://t/api/items/${id}/reviews`, token, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe('POST /api/items/[id]/reviews', () => {
  beforeEach(resetDb)

  it('买家评价卖家：成功且信誉分重算', async () => {
    const { seller, buyer, item } = await seedSoldItem()
    const token = await createTestSession(buyer.id)
    const res = await call(item.id, token, { rating: 5, content: '发货快，成色和描述一致' })
    expect(res.status).toBe(200)
    const freshSeller = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })
    expect(freshSeller.ratingAvg).toBe(5)
    expect(freshSeller.ratingCount).toBe(1)
    const review = await prisma.review.findFirstOrThrow()
    expect(review.authorId).toBe(buyer.id)
    expect(review.targetId).toBe(seller.id)
  })

  it('重复评价 → 409（Review Focus #1）', async () => {
    const { buyer, item } = await seedSoldItem()
    const token = await createTestSession(buyer.id)
    await call(item.id, token, { rating: 5 })
    const res = await call(item.id, token, { rating: 1 })
    expect(res.status).toBe(409)
    expect(await prisma.review.count()).toBe(1)
  })

  it('双方互评后信誉分取平均', async () => {
    const { seller, buyer, item } = await seedSoldItem()
    await call(item.id, await createTestSession(buyer.id), { rating: 5 })
    await call(item.id, await createTestSession(seller.id), { rating: 3 })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).ratingAvg).toBe(5)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).ratingAvg).toBe(3)
  })

  it('非交易双方 → 403；未成交商品 → 403', async () => {
    const { seller, buyer, item } = await seedSoldItem()
    const stranger = await createTestUser()
    expect((await call(item.id, await createTestSession(stranger.id), { rating: 5 })).status).toBe(403)

    const unsoldItem = await prisma.item.create({
      data: {
        title: '还没卖出去的商品', description: '在售中，尚未成交。', priceCents: 1000,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: seller.id,
      },
    })
    expect((await call(unsoldItem.id, await createTestSession(buyer.id), { rating: 5 })).status).toBe(403)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

- [ ] **Step 3: 实现评价路由**

`src/app/api/items/[id]/reviews/route.ts`：

```ts
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { reviewSchema } from '@/lib/validators'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params

    const item = await prisma.item.findUnique({ where: { id } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
    if (item.status !== 'SOLD' || !item.buyerId) throw new ApiError('FORBIDDEN', '商品尚未成交，不能评价')
    const isSeller = item.sellerId === user.id
    const isBuyer = item.buyerId === user.id
    if (!isSeller && !isBuyer) throw new ApiError('FORBIDDEN', '只有交易双方能评价')
    const targetId = isSeller ? item.buyerId : item.sellerId

    const { rating, content } = reviewSchema.parse(await readJson(req))

    try {
      await prisma.$transaction(async (tx) => {
        await tx.review.create({
          data: { itemId: id, authorId: user.id, targetId, rating, content: content ?? null },
        })
        // 信誉分以聚合重算，杜绝增量漂移
        const agg = await tx.review.aggregate({
          where: { targetId },
          _avg: { rating: true },
          _count: { _all: true },
        })
        await tx.user.update({
          where: { id: targetId },
          data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all },
        })
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('CONFLICT', '你已经评价过这笔交易了')
      }
      throw err
    }

    const review = await prisma.review.findUniqueOrThrow({
      where: { itemId_authorId: { itemId: id, authorId: user.id } },
      include: { author: { select: { id: true, username: true, avatarUrl: true } } },
    })
    return NextResponse.json({
      review: {
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt.toISOString(),
        author: review.author,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm test
```

- [ ] **Step 5: 实现 ReviewSection 并挂到详情页**

`src/components/item-detail/ReviewSection.tsx`：

```tsx
'use client'

import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useApi } from '@/lib/client-api'
import { formatRelativeTime } from '@/lib/format'

export interface ReviewData {
  id: string
  rating: number
  content: string | null
  createdAt: string
  author: { id: string; username: string; avatarUrl: string | null }
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} 星`} className="text-sm text-[#f5a623]">
      {'★'.repeat(value)}
      <span className="text-line">{'★'.repeat(5 - value)}</span>
    </span>
  )
}

export function ReviewSection({
  itemId,
  canReview,
  targetName,
  myReview,
  reviews,
}: {
  itemId: string
  canReview: boolean
  targetName: string
  myReview: ReviewData | null
  reviews: ReviewData[]
}) {
  const { request } = useApi()
  const [list, setList] = useState(reviews)
  const [mine, setMine] = useState(myReview)
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  if (!canReview && list.length === 0) return null

  async function submit() {
    setLoading(true)
    const result = await request<{ review: ReviewData }>(`/api/items/${itemId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ rating, content: content.trim() || undefined }),
    })
    setLoading(false)
    if (result.ok) {
      setMine(result.data.review)
      setList((prev) => [result.data.review, ...prev])
    }
  }

  return (
    <section className="mt-6 rounded-card bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-base font-bold">交易评价{list.length > 0 && `（${list.length}）`}</h2>
      {canReview && !mine && (
        <div className="mb-4 rounded-btn bg-bg p-3">
          <p className="mb-2 text-sm text-muted">给 {targetName} 打个分吧</p>
          <div className="mb-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" aria-label={`${star} 星`} onClick={() => setRating(star)} className="text-xl">
                <span className={star <= rating ? 'text-[#f5a623]' : 'text-line'}>★</span>
              </button>
            ))}
          </div>
          <Textarea name="review" rows={2} maxLength={200} placeholder="说点什么（可选）"
            value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} loading={loading}>提交评价</Button>
          </div>
        </div>
      )}
      {mine && !canReview === false && (
        <p className="mb-3 text-sm text-muted">你已评价：<Stars value={mine.rating} />{mine.content && ` ${mine.content}`}</p>
      )}
      <ul className="space-y-3">
        {list.map((review) => (
          <li key={review.id} className="flex gap-2.5">
            <Avatar src={review.author.avatarUrl} name={review.author.username} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {review.author.username}<span className="ml-2">{formatRelativeTime(review.createdAt)}</span>
              </p>
              <Stars value={review.rating} />
              {review.content && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{review.content}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

修改 `src/app/items/[id]/page.tsx`：

1）import 增加：

```ts
import { ReviewSection } from '@/components/item-detail/ReviewSection'
```

2）取商品/留言之后追加（注意：`item` 已 include `seller`，需要 buyer 也拿到）：

```ts
  const reviews = await prisma.review.findMany({
    where: { itemId: item.id },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, username: true, avatarUrl: true } } },
  })
  const reviewData = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    content: review.content,
    createdAt: review.createdAt.toISOString(),
    author: review.author,
  }))
  const isParticipant = user && item.status === 'SOLD' && (user.id === item.sellerId || user.id === item.buyerId)
  const targetName = user && item.buyerId === user.id ? item.seller.username : '买家' // 卖家视角评买家
  const myReview = user ? reviewData.find((review) => review.author.id === user.id) ?? null : null
```

3）在右栏（SellerCard 之后）插入：

```tsx
        <ReviewSection
          itemId={item.id}
          canReview={Boolean(isParticipant)}
          targetName={targetName}
          myReview={myReview}
          reviews={reviewData}
        />
```

（page 里 `item` 的 include 需要同时拿到 `buyer`：把 `include` 加 `buyer: true`，卖家视角显示买家昵称时可改为 `item.buyer?.username ?? '买家'`。）

- [ ] **Step 6: 实现用户主页**

`src/app/users/[id]/page.tsx`：

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item/ItemCard'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'
import { queryItems, toItemCardData } from '@/lib/items'

const TABS = [
  { key: 'onsale', label: '在售' },
  { key: 'sold', label: '已售' },
  { key: 'reviews', label: '评价' },
] as const

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: tabParam } = await searchParams
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'onsale'

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || user.status === 'BANNED') notFound()

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
        <Avatar src={user.avatarUrl} name={user.username} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-extrabold">
            {user.username}
            {user.verifiedAt && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e6f6f1] px-2 py-0.5 text-xs font-semibold text-brand-deep">
                <Icon name="shield" size={11} />已认证
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user.ratingCount > 0 ? (
              <span className="text-[#f5a623]">★ {user.ratingAvg.toFixed(1)}</span>
            ) : (
              '暂无评价'
            )}
            <span className="ml-3">成交 {user.soldCount} 单</span>
            {user.campus && <span className="ml-3">{user.campus}</span>}
            <span className="ml-3">{formatRelativeTime(user.createdAt)}加入</span>
          </p>
        </div>
      </header>

      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/users/${id}?tab=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-brand text-white' : 'bg-white text-muted shadow-card hover:text-ink'}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'reviews' ? <ReviewsList userId={id} /> : <ItemsGrid userId={id} sold={tab === 'sold'} />}
    </div>
  )
}

async function ItemsGrid({ userId, sold }: { userId: string; sold: boolean }) {
  const { items } = await queryItems({
    sellerId: userId,
    statuses: sold ? ['SOLD'] : ['ON_SALE', 'RESERVED'],
    limit: 30,
  })
  if (items.length === 0) return <EmptyState title={sold ? '还没有成交记录' : '暂无在售商品'} />
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {items.map((item) => <ItemCard key={item.id} item={toItemCardData(item)} />)}
    </div>
  )
}

async function ReviewsList({ userId }: { userId: string }) {
  const reviews = await prisma.review.findMany({
    where: { targetId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      item: { select: { id: true, title: true } },
    },
  })
  if (reviews.length === 0) return <EmptyState title="还没有收到评价" />
  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Avatar src={review.author.avatarUrl} name={review.author.username} size={26} />
            {review.author.username}
            <span className="text-[#f5a623]">★ {review.rating}</span>
            <span className="ml-auto">{formatRelativeTime(review.createdAt)}</span>
          </div>
          {review.content && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{review.content}</p>}
          <Link href={`/items/${review.item.id}`} className="mt-2 block text-xs text-brand hover:underline">
            来自《{review.item.title}》的交易
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 7: 运行测试 + 手动验证 + 提交**

```bash
npm test
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors -o /dev/null -w "%{http_code}" http://localhost:3000/users/not-exist
echo
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：测试 PASS；不存在的用户返回 404。

```bash
git add -A
git commit -m "feat: 成交互评（聚合重算信誉分、防重复）+ 用户主页（在售/已售/评价）"
```

---

## 阶段 4：实时聊天

### Task 18: 实时层服务端（Socket.IO 全量实现）

**Files:**
- Create: `src/lib/messages.ts`（消息与会话的序列化层）
- Modify: `src/lib/realtime.ts`（替换 T2 的日志桩，签名不变）
- Create: `tests/helpers/server.ts`（子进程起真实服务器）
- Test: `tests/realtime/socket.test.ts`

**Interfaces:**
- Consumes: T6 `validateSessionToken`、T3 prisma、T4 `messageSendSchema`
- Produces:
  - `MessageData = { id, conversationId, type: 'TEXT'|'IMAGE', content, clientId, readAt: string|null, createdAt: string, sender: {id,username,avatarUrl,verifiedAt} }`
  - `messageInclude` / `toMessageData`（`src/lib/messages.ts`）
  - Socket 事件（与 Spec §5.2 事件表一致）：
    - C→S `conversation:join {conversationId}` → ack `{ok:true}`（校验参与者）
    - C→S `message:send {conversationId, type, content, clientId}` → ack `{ok:true, message}`；**相同 clientId 重发幂等返回旧消息**
    - C→S `message:read {conversationId}` → 置对方未读消息 readAt，并向对方 `user:{id}` 房间广播 `message:read`
    - C→S `typing {conversationId, isTyping}` → 转发会话房间旁人（需已 join）
    - S→C `message:new {message}`（落库后广播：对方 user 房间 + 会话房间）
  - 握手：无有效 session cookie → 拒绝连接（`UNAUTHENTICATED`）
  - `startTestServer(): Promise<{ stop }>`（`tests/helpers/server.ts`，端口 3517，注入 `DATABASE_URL=file:./test.db`）

- [ ] **Step 1: 写失败的测试**

`tests/helpers/server.ts`：

```ts
import { spawn } from 'node:child_process'

export const TEST_PORT = 3517
export const TEST_BASE_URL = `http://localhost:${TEST_PORT}`

export async function startTestServer(): Promise<{ stop: () => Promise<void> }> {
  const child = spawn('npx', ['tsx', 'server.ts'], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'development',
      DATABASE_URL: 'file:./test.db', // 与测试进程同库
    },
    stdio: 'pipe',
    shell: process.platform === 'win32', // Windows 下 npx 是 .cmd
  })

  const deadline = Date.now() + 120_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${TEST_BASE_URL}/api/health`)
      if (res.ok) {
        ready = true
        break
      }
    } catch {
      // 还没起来，继续轮询
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!ready) {
    child.kill()
    throw new Error('测试服务器 120 秒内未就绪')
  }

  return {
    stop: async () => {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      } else {
        child.kill()
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    },
  }
}
```

`tests/realtime/socket.test.ts`：

```ts
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser } from '../helpers/factory'
import { startTestServer, TEST_BASE_URL } from '../helpers/server'

let server: { stop: () => Promise<void> }

function connect(token: string | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(TEST_BASE_URL, {
      transports: ['websocket'],
      extraHeaders: token ? { cookie: `session=${token}` } : {},
      reconnection: false,
    })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', (err) => reject(err))
  })
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve))
}

async function seedConversation() {
  const seller = await createTestUser()
  const buyer = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: 'iPad 9代 64G', description: '自用一年，成色很好。', priceCents: 125000,
      category: 'DIGITAL', condition: 'LIKE_NEW_90', location: '东区', sellerId: seller.id,
    },
  })
  const conversation = await prisma.conversation.create({
    data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id },
  })
  return { seller, buyer, item, conversation }
}

beforeAll(async () => {
  server = await startTestServer()
}, 150_000)

afterAll(async () => {
  await server.stop()
})

describe('Socket.IO 实时层', () => {
  beforeEach(resetDb)

  it('无 cookie 连接被拒绝（UNAUTHENTICATED）', async () => {
    await expect(connect(null)).rejects.toThrow(/UNAUTHENTICATED/)
  })

  it('带会话连接成功；非参与者 join 被拒；参与者 join 成功', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const stranger = await createTestUser()

    const buyerSocket = await connect(await createTestSession(buyer.id))
    const strangerSocket = await connect(await createTestSession(stranger.id))

    const denied = await emitAck<{ ok: boolean; error?: { code: string } }>(strangerSocket, 'conversation:join', { conversationId: conversation.id })
    expect(denied.ok).toBe(false)
    expect(denied.error?.code).toBe('FORBIDDEN')

    expect((await emitAck<{ ok: boolean }>(buyerSocket, 'conversation:join', { conversationId: conversation.id })).ok).toBe(true)

    buyerSocket.disconnect()
    strangerSocket.disconnect()
  })

  it('发送消息：ack 返回消息、落库、对方实时收到 message:new、会话预览更新', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const received = new Promise<{ message: { content: string } }>((resolve) => {
      sellerSocket.on('message:new', resolve)
    })

    const ack = await emitAck<{ ok: boolean; message: { id: string; content: string } }>(buyerSocket, 'message:send', {
      conversationId: conversation.id, type: 'TEXT', content: '同学，还在吗？', clientId: 'client-1',
    })
    expect(ack.ok).toBe(true)
    expect(ack.message.content).toBe('同学，还在吗？')

    const pushed = await received
    expect(pushed.message.content).toBe('同学，还在吗？')

    const stored = await prisma.message.findFirstOrThrow()
    expect(stored.content).toBe('同学，还在吗？')
    const freshConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(freshConversation.lastMessagePreview).toBe('同学，还在吗？')

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })

  it('相同 clientId 重发幂等：不产生第二条消息', async () => {
    const { buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const payload = { conversationId: conversation.id, type: 'TEXT', content: '你好', clientId: 'dup-1' }
    const first = await emitAck<{ message: { id: string } }>(buyerSocket, 'message:send', payload)
    const second = await emitAck<{ message: { id: string } }>(buyerSocket, 'message:send', payload)
    expect(second.message.id).toBe(first.message.id)
    expect(await prisma.message.count()).toBe(1)

    buyerSocket.disconnect()
  })

  it('已读回执：对方收到 message:read 且未读清零', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })
    await emitAck(sellerSocket, 'conversation:join', { conversationId: conversation.id })

    await emitAck(buyerSocket, 'message:send', { conversationId: conversation.id, type: 'TEXT', content: '在吗', clientId: 'm1' })

    const readEvent = new Promise<{ conversationId: string }>((resolve) => {
      buyerSocket.on('message:read', resolve)
    })
    await emitAck(sellerSocket, 'message:read', { conversationId: conversation.id })
    const event = await readEvent
    expect(event.conversationId).toBe(conversation.id)
    expect(await prisma.message.count({ where: { readAt: null } })).toBe(0)

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })

  it('typing 转发：未 join 会话房间的 socket 不会收到', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const typingEvents: unknown[] = []
    sellerSocket.on('typing', (payload) => typingEvents.push(payload))
    buyerSocket.emit('typing', { conversationId: conversation.id, isTyping: true })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(typingEvents).toHaveLength(0) // seller 未 join → 收不到

    await emitAck(sellerSocket, 'conversation:join', { conversationId: conversation.id })
    buyerSocket.emit('typing', { conversationId: conversation.id, isTyping: true })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(typingEvents).toHaveLength(1)

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })
})
```

注意：`socket.io-client` 需要在 dependencies（运行时也会用到）：`npm i socket.io-client`（若之前是 `-D` 装的，这一步会把它移入 dependencies）。

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

预期：socket 测试 FAIL（realtime 还是日志桩，`connect(null)` 不会被拒）。

- [ ] **Step 3: 实现 src/lib/messages.ts**

```ts
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export const senderSelect = { id: true, username: true, avatarUrl: true, verifiedAt: true } as const

export const messageInclude = { sender: { select: senderSelect } } satisfies Prisma.MessageInclude

export interface MessageData {
  id: string
  conversationId: string
  type: 'TEXT' | 'IMAGE'
  content: string
  clientId: string | null
  readAt: string | null
  createdAt: string
  sender: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
}

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>

export function toMessageData(row: MessageRow): MessageData {
  return {
    id: row.id,
    conversationId: row.conversationId,
    type: row.type as MessageData['type'],
    content: row.content,
    clientId: row.clientId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    sender: {
      id: row.sender.id,
      username: row.sender.username,
      avatarUrl: row.sender.avatarUrl,
      verifiedAt: row.sender.verifiedAt ? row.sender.verifiedAt.toISOString() : null,
    },
  }
}

/** 会话列表（T20 用）：含商品摘要、对方用户、未读数 */
export async function queryConversationsForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      item: { select: { id: true, title: true, priceCents: true, status: true, images: { orderBy: { sort: 'asc' }, take: 1 } } },
      buyer: { select: senderSelect },
      seller: { select: senderSelect },
      _count: { select: { messages: { where: { senderId: { not: userId }, readAt: null } } } },
    },
  })
  return conversations.map((conversation) => ({
    id: conversation.id,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    lastMessagePreview: conversation.lastMessagePreview,
    unreadCount: conversation._count.messages,
    item: conversation.item,
    other: conversation.buyerId === userId ? conversation.seller : conversation.buyer,
  }))
}

/** 全站未读计数（顶栏红点，T20 用） */
export async function countUnreadMessages(userId: string): Promise<number> {
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    },
  })
}
```

- [ ] **Step 4: 实现 src/lib/realtime.ts（全量替换）**

```ts
import type { Server as SocketIOServer, Socket } from 'socket.io'
import { z } from 'zod'
import { SESSION_COOKIE, parseCookieHeader, validateSessionToken, type AuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { messageInclude, toMessageData } from '@/lib/messages'
import { messageSendSchema } from '@/lib/validators'

interface AuthedSocketData {
  user: AuthUser
}

type AuthedSocket = Socket & { data: AuthedSocketData }

const userRoom = (userId: string) => `user:${userId}`
const conversationRoom = (conversationId: string) => `conv:${conversationId}`

const sendPayloadSchema = z.intersection(messageSendSchema, z.object({ conversationId: z.string().min(1) }))

/** 挂载实时层：握手复用 HTTP 的 session 鉴权，消息先落库再广播 */
export function attachRealtime(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? null
      const token = parseCookieHeader(cookieHeader)[SESSION_COOKIE]
      const user = token ? await validateSessionToken(token) : null
      if (!user) return next(new Error('UNAUTHENTICATED'))
      ;(socket as AuthedSocket).data.user = user
      next()
    } catch (err) {
      next(err instanceof Error ? err : new Error('INTERNAL'))
    }
  })

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthedSocket
    const user = socket.data.user
    void socket.join(userRoom(user.id))

    socket.on('conversation:join', async (payload: unknown, ack?: (res: unknown) => void) => {
      const conversationId = readConversationId(payload)
      const conversation = conversationId
        ? await prisma.conversation.findUnique({ where: { id: conversationId } })
        : null
      if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
        return ack?.({ ok: false, error: { code: 'FORBIDDEN', message: '无权访问该会话' } })
      }
      void socket.join(conversationRoom(conversationId!))
      ack?.({ ok: true })
    })

    socket.on('conversation:leave', async (payload: unknown) => {
      const conversationId = readConversationId(payload)
      if (conversationId) void socket.leave(conversationRoom(conversationId))
    })

    socket.on('message:send', async (payload: unknown, ack?: (res: unknown) => void) => {
      try {
        const parsed = sendPayloadSchema.safeParse(payload)
        if (!parsed.success) {
          return ack?.({ ok: false, error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? '消息不合法' } })
        }
        const { conversationId, type, content, clientId } = parsed.data

        const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
        if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
          return ack?.({ ok: false, error: { code: 'FORBIDDEN', message: '无权在该会话发言' } })
        }

        // 幂等：断线重试携带相同 clientId → 直接返回已存消息
        const existing = await prisma.message.findUnique({
          where: { conversationId_clientId: { conversationId, clientId } },
          include: messageInclude,
        })
        if (existing) return ack?.({ ok: true, message: toMessageData(existing) })

        const message = await prisma.$transaction(async (tx) => {
          const created = await tx.message.create({
            data: { conversationId, senderId: user.id, type, content, clientId },
            include: messageInclude,
          })
          await tx.conversation.update({
            where: { id: conversationId },
            data: {
              lastMessageAt: new Date(),
              lastMessagePreview: type === 'IMAGE' ? '[图片]' : content.slice(0, 60),
            },
          })
          return created
        })

        const payloadOut = { message: toMessageData(message) }
        const recipientId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId
        io.to(userRoom(recipientId)).emit('message:new', payloadOut)
        socket.to(conversationRoom(conversationId)).emit('message:new', payloadOut)
        ack?.({ ok: true, message: payloadOut.message })
      } catch {
        ack?.({ ok: false, error: { code: 'INTERNAL', message: '发送失败，请重试' } })
      }
    })

    socket.on('message:read', async (payload: unknown, ack?: (res: unknown) => void) => {
      try {
        const conversationId = readConversationId(payload)
        const conversation = conversationId
          ? await prisma.conversation.findUnique({ where: { id: conversationId } })
          : null
        if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
          return ack?.({ ok: false, error: { code: 'FORBIDDEN', message: '无权访问该会话' } })
        }
        const readAt = new Date()
        await prisma.message.updateMany({
          where: { conversationId: conversation.id, senderId: { not: user.id }, readAt: null },
          data: { readAt },
        })
        const recipientId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId
        io.to(userRoom(recipientId)).emit('message:read', { conversationId: conversation.id, readAt: readAt.toISOString() })
        ack?.({ ok: true })
      } catch {
        ack?.({ ok: false, error: { code: 'INTERNAL', message: '操作失败' } })
      }
    })

    socket.on('typing', (payload: unknown) => {
      const conversationId = readConversationId(payload)
      if (!conversationId) return
      if (!socket.rooms.has(conversationRoom(conversationId))) return // 必须先 join（已校验参与者）
      const isTyping = Boolean((payload as { isTyping?: unknown })?.isTyping)
      socket.to(conversationRoom(conversationId)).emit('typing', { conversationId, userId: user.id, isTyping })
    })
  })
}

function readConversationId(payload: unknown): string | null {
  const value = (payload as { conversationId?: unknown })?.conversationId
  return typeof value === 'string' && value.length > 0 ? value : null
}
```

- [ ] **Step 5: 运行确认通过**

```bash
npm test
```

预期：socket 测试全 PASS（首次运行会起真实服务器，耐心等待；若 120 秒超时，检查 tsx 是否在 node_modules/.bin）。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: Socket.IO 实时层（握手复用 session、房间模型、幂等发送、已读回执、typing）"
```

### Task 19: 聊天窗客户端（乐观发送 / 已读 / 正在输入）+ 聊天入口

**Files:**
- Modify: `src/lib/validators.ts`（追加 `createConversationSchema`）
- Create: `src/hooks/useSocket.ts`（模块级共享连接，避免多组件重复建链）
- Create: `src/app/api/conversations/route.ts`（POST find-or-create）
- Create: `src/components/item-detail/ChatButton.tsx`
- Create: `src/app/chat/[id]/page.tsx`（RSC）+ `src/components/chat/ChatWindow.tsx`（客户端）
- Modify: `src/app/items/[id]/page.tsx`（占位「聊一聊」→ ChatButton）
- Test: `tests/api/conversations.test.ts`

**Interfaces:**
- Consumes: T18 的 Socket 事件与 `MessageData`、T5 组件、T6 守卫
- Produces:
  - `createConversationSchema = z.object({ itemId: z.string().min(1) })`（validators.ts 追加）
  - `POST /api/conversations` → 200 `{conversation:{id}}`；自己的商品 400；**已售/已下架且无历史会话 → 409（Review Focus #2）；有历史会话则返回它**
  - `useSocket()` → `{ socket, connected }`（全标签页共享一条连接）
  - `ChatWindow({ conversationId, currentUserId, other, item, initialMessages })`：乐观发送（灰显→ack 替换/失败可点重发）、Enter 发送、Shift+Enter 换行、`message:new/read/typing` 实时处理、进入即已读、图片消息（上传后以 IMAGE 发送）、只有最后一条自己的消息显示 已读/未读/发送中
  - `ChatButton({ itemId, isLoggedIn, isOwner })`：未登录跳登录页；自己的商品禁用

- [ ] **Step 1: validators 追加 + 写失败的测试**

`src/lib/validators.ts` 末尾追加：

```ts
export const createConversationSchema = z.object({
  itemId: z.string().min(1, '缺少商品'),
})
```

`tests/api/conversations.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { POST as conversationPOST } from '@/app/api/conversations/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedItem(overrides: Record<string, unknown> = {}) {
  const seller = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '宿舍小冰箱 45L', description: '九成新，制冷正常。', priceCents: 8000,
      category: 'DORM', condition: 'LIKE_NEW_90', location: '南区宿舍', sellerId: seller.id,
      ...overrides,
    },
  })
  return { seller, item }
}

const call = (token: string | null, body: unknown) =>
  conversationPOST(reqWithCookie('http://t/api/conversations', token, { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/conversations（find-or-create）', () => {
  beforeEach(resetDb)

  it('首次创建成功；再次调用返回同一会话', async () => {
    const { item } = await seedItem()
    const buyer = await createTestUser()
    const token = await createTestSession(buyer.id)
    const first = await (await call(token, { itemId: item.id })).json()
    const second = await (await call(token, { itemId: item.id })).json()
    expect(second.conversation.id).toBe(first.conversation.id)
    expect(await prisma.conversation.count()).toBe(1)
  })

  it('不能和自己的商品发起会话（400）', async () => {
    const { seller, item } = await seedItem()
    const token = await createTestSession(seller.id)
    expect((await call(token, { itemId: item.id })).status).toBe(400)
  })

  it('已售商品：没有历史会话不能新建（409）；已有会话则返回（Review Focus #2）', async () => {
    const { seller, item } = await seedItem({ status: 'SOLD', buyerId: null })
    const buyer = await createTestUser()
    const token = await createTestSession(buyer.id)
    expect((await call(token, { itemId: item.id })).status).toBe(409)

    const conversation = await prisma.conversation.create({
      data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id },
    })
    const res = await call(token, { itemId: item.id })
    expect(res.status).toBe(200)
    expect((await res.json()).conversation.id).toBe(conversation.id)
  })

  it('未登录 → 401', async () => {
    const { item } = await seedItem()
    expect((await call(null, { itemId: item.id })).status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

- [ ] **Step 3: 实现会话路由**

`src/app/api/conversations/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { createConversationSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { itemId } = createConversationSchema.parse(await readJson(req))

    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')
    if (item.sellerId === user.id) throw new ApiError('VALIDATION', '不能和自己的商品发起会话')

    const existing = await prisma.conversation.findUnique({
      where: { itemId_buyerId: { itemId, buyerId: user.id } },
    })
    if (item.status === 'SOLD' || item.status === 'DELISTED') {
      if (!existing) throw new ApiError('CONFLICT', '该商品已售出或已下架，不能再发起新会话')
      return NextResponse.json({ conversation: { id: existing.id } })
    }

    const conversation = await prisma.conversation.upsert({
      where: { itemId_buyerId: { itemId, buyerId: user.id } },
      create: { itemId, buyerId: user.id, sellerId: item.sellerId },
      update: {},
    })
    return NextResponse.json({ conversation: { id: conversation.id } })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm test
```

- [ ] **Step 5: 实现 useSocket（共享连接）**

`src/hooks/useSocket.ts`：

```ts
'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

let sharedSocket: Socket | null = null
let refCount = 0

function acquire(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({
      transports: ['websocket', 'polling'],
      reconnection: true, // 断线自动重连（Spec §5.2）
    })
  }
  refCount += 1
  return sharedSocket
}

function release(): void {
  refCount -= 1
  if (refCount <= 0 && sharedSocket) {
    sharedSocket.disconnect()
    sharedSocket = null
    refCount = 0
  }
}

/** 全标签页共享一条 Socket 连接；无登录态时用 enabled=false 关闭 */
export function useSocket(enabled = true): { socket: Socket | null; connected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const instance = acquire()
    setSocket(instance)
    setConnected(instance.connected)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    instance.on('connect', onConnect)
    instance.on('disconnect', onDisconnect)
    return () => {
      instance.off('connect', onConnect)
      instance.off('disconnect', onDisconnect)
      setSocket(null)
      setConnected(false)
      release()
    }
  }, [enabled])

  return { socket, connected }
}
```

- [ ] **Step 6: 实现 ChatButton 与聊天页**

`src/components/item-detail/ChatButton.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useApi } from '@/lib/client-api'

export function ChatButton({ itemId, isLoggedIn, isOwner }: { itemId: string; isLoggedIn: boolean; isOwner: boolean }) {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)

  async function open() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/items/${itemId}`)}`)
      return
    }
    setLoading(true)
    const result = await request<{ conversation: { id: string } }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    })
    setLoading(false)
    if (result.ok) router.push(`/chat/${result.data.conversation.id}`)
  }

  return (
    <Button onClick={open} loading={loading} disabled={isOwner} className="flex-1" title={isOwner ? '这是你自己的商品' : undefined}>
      <Icon name="chat" size={15} />
      聊一聊
    </Button>
  )
}
```

修改 `src/app/items/[id]/page.tsx`：import 增加 `import { ChatButton } from '@/components/item-detail/ChatButton'`；把占位的 `<button type="button" disabled …>聊一聊</button>` 整块替换为：

```tsx
            <ChatButton itemId={item.id} isLoggedIn={Boolean(user)} isOwner={user?.id === item.sellerId} />
```

`src/app/chat/[id]/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { messageInclude, toMessageData } from '@/lib/messages'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect(`/login?next=${encodeURIComponent(`/chat/${id}`)}`)

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, title: true, priceCents: true, images: { orderBy: { sort: 'asc' }, take: 1 } } },
      buyer: true,
      seller: true,
    },
  })
  if (!conversation) notFound()
  if (conversation.buyerId !== user.id && conversation.sellerId !== user.id) notFound()

  const rows = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: messageInclude,
  })
  const other = conversation.buyerId === user.id ? conversation.seller : conversation.buyer

  return (
    <ChatWindow
      conversationId={id}
      currentUserId={user.id}
      other={{
        id: other.id,
        username: other.username,
        avatarUrl: other.avatarUrl,
        verifiedAt: other.verifiedAt ? other.verifiedAt.toISOString() : null,
      }}
      item={{
        id: conversation.item.id,
        title: conversation.item.title,
        priceCents: conversation.item.priceCents,
        coverUrl: conversation.item.images[0]?.url ?? null,
      }}
      initialMessages={rows.reverse().map(toMessageData)}
    />
  )
}
```

`src/components/chat/ChatWindow.tsx`：

```tsx
'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { useSocket } from '@/hooks/useSocket'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import type { MessageData } from '@/lib/messages'

type LocalMessage = MessageData & { pending?: boolean; failed?: boolean }

interface ChatWindowProps {
  conversationId: string
  currentUserId: string
  other: { id: string; username: string; avatarUrl: string | null; verifiedAt: string | null }
  item: { id: string; title: string; priceCents: number; coverUrl: string | null }
  initialMessages: MessageData[]
}

export function ChatWindow({ conversationId, currentUserId, other, item, initialMessages }: ChatWindowProps) {
  const { socket, connected } = useSocket()
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [otherTyping, setOtherTyping] = useState(false)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentAt = useRef(0)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // 进入会话：join + 标记已读（断线重连后自动重放）
  useEffect(() => {
    if (!socket) return
    const join = () => {
      socket.emit('conversation:join', { conversationId }, (res: { ok: boolean }) => {
        if (res?.ok) socket.emit('message:read', { conversationId })
      })
    }
    if (socket.connected) join()
    socket.on('connect', join)
    return () => {
      socket.off('connect', join)
      socket.emit('conversation:leave', { conversationId })
    }
  }, [socket, conversationId])

  // 实时事件
  useEffect(() => {
    if (!socket) return
    const onNew = (payload: { message: MessageData }) => {
      const message = payload.message
      if (message.conversationId !== conversationId) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev
        // 自己的乐观消息用 clientId 对上号后替换
        if (message.clientId && prev.some((m) => m.clientId === message.clientId)) {
          return prev.map((m) => (m.clientId === message.clientId ? message : m))
        }
        return [...prev, message]
      })
      if (message.sender.id !== currentUserId) socket.emit('message:read', { conversationId })
    }
    const onRead = (payload: { conversationId: string; readAt: string }) => {
      if (payload.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.map((m) => (m.sender.id === currentUserId && !m.readAt ? { ...m, readAt: payload.readAt } : m)),
      )
    }
    const onTyping = (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (payload.conversationId !== conversationId || payload.userId === currentUserId) return
      setOtherTyping(payload.isTyping)
    }
    socket.on('message:new', onNew)
    socket.on('message:read', onRead)
    socket.on('typing', onTyping)
    return () => {
      socket.off('message:new', onNew)
      socket.off('message:read', onRead)
      socket.off('typing', onTyping)
    }
  }, [socket, conversationId, currentUserId])

  // 新消息/对方输入 → 滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, otherTyping])

  const send = useCallback(
    (type: 'TEXT' | 'IMAGE', content: string) => {
      if (!socket || !content) return
      const clientId = crypto.randomUUID()
      const optimistic: LocalMessage = {
        id: `local-${clientId}`,
        conversationId,
        type,
        content,
        clientId,
        readAt: null,
        createdAt: new Date().toISOString(),
        sender: { id: currentUserId, username: '我', avatarUrl: null, verifiedAt: null },
        pending: true,
      }
      setMessages((prev) => [...prev, optimistic])
      socket.emit(
        'message:send',
        { conversationId, type, content, clientId },
        (res: { ok: boolean; message?: MessageData }) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.clientId !== clientId) return m
              return res.ok && res.message ? res.message : { ...m, pending: false, failed: true }
            }),
          )
        },
      )
    },
    [socket, conversationId, currentUserId],
  )

  function onInputChange(value: string) {
    setInput(value)
    if (!socket) return
    const now = Date.now()
    if (now - lastTypingSentAt.current > 2000) {
      lastTypingSentAt.current = now
      socket.emit('typing', { conversationId, isTyping: true })
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current)
    typingStopTimer.current = setTimeout(() => {
      socket.emit('typing', { conversationId, isTyping: false })
    }, 2500)
  }

  function retry(message: LocalMessage) {
    setMessages((prev) => prev.filter((m) => m.id !== message.id))
    if (message.clientId) send(message.type, message.content)
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col rounded-card bg-surface shadow-card">
      <Link href={`/items/${item.id}`} className="flex items-center gap-3 border-b border-line p-3 transition hover:bg-bg">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" className="size-11 rounded-btn object-cover" />
        ) : (
          <div className="size-11 rounded-btn bg-[#e8edf3]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
          <p className="text-xs font-bold text-price">{formatPrice(item.priceCents)}</p>
        </div>
        <span className={`shrink-0 text-xs ${connected ? 'text-brand' : 'text-muted'}`}>
          {connected ? '● 在线' : '○ 连接中…'}
        </span>
      </Link>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => {
          const mine = message.sender.id === currentUserId
          const prev = messages[index - 1]
          const showTime = !prev || new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000
          const isLastMine = mine && index === messages.length - 1
          return (
            <div key={message.id}>
              {showTime && <p className="mb-2 text-center text-xs text-muted">{formatRelativeTime(message.createdAt)}</p>}
              <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar src={mine ? null : message.sender.avatarUrl} name={mine ? '我' : message.sender.username} size={28} />
                <div className="max-w-[70%]">
                  <div
                    className={`whitespace-pre-wrap break-words rounded-card px-3 py-2 text-sm ${
                      mine ? 'bg-brand text-white' : 'bg-bg text-ink'
                    } ${message.pending ? 'opacity-60' : ''} ${message.failed ? 'ring-1 ring-[#d94f3d]' : ''}`}
                  >
                    {message.type === 'IMAGE' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={message.content} alt="图片消息" className="max-h-56 rounded-btn" />
                    ) : (
                      message.content
                    )}
                  </div>
                  {mine && isLastMine && (
                    <p className="mt-1 text-right text-xs text-muted">
                      {message.failed ? (
                        <button type="button" className="text-[#d94f3d]" onClick={() => retry(message)}>
                          发送失败，点击重发
                        </button>
                      ) : message.pending ? (
                        '发送中…'
                      ) : message.readAt ? (
                        '已读'
                      ) : (
                        '未读'
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {otherTyping && <p className="text-xs text-muted">{other.username} 正在输入…</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line p-3">
        <label className="cursor-pointer rounded-btn p-2 text-muted transition hover:bg-bg hover:text-brand" aria-label="发送图片">
          <Icon name="image" size={20} />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const form = new FormData()
              form.append('file', file)
              const res = await fetch('/api/upload', { method: 'POST', body: form })
              if (!res.ok) return
              const stored: { url: string } = await res.json()
              send('IMAGE', stored.url)
            }}
          />
        </label>
        <textarea
          rows={1}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              const text = input.trim()
              if (text) {
                send('TEXT', text)
                setInput('')
              }
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-btn border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          aria-label="发送"
          disabled={!input.trim()}
          onClick={() => {
            const text = input.trim()
            if (text) {
              send('TEXT', text)
              setInput('')
            }
          }}
          className="rounded-btn bg-brand p-2.5 text-white transition disabled:opacity-40"
        >
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 手动验证双窗口 + 提交**

```bash
npm test
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors -o /dev/null -w "%{http_code}" http://localhost:3000/chat
echo
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

预期：测试 PASS；未登录访问 `/chat` 返回 307。随后用两个浏览器窗口（或普通 + 隐身）分别登录两个 seed 账号做人工双窗口验证（T26 完成后完整走查）。

```bash
git add -A
git commit -m "feat: 聊天窗（乐观发送/已读/正在输入/图片消息）+ 会话创建入口与 ChatButton"
```

---

### Task 20: 会话列表 + 未读红点

**Files:**
- Create: `src/app/chat/page.tsx`（RSC 会话列表）+ `src/components/chat/ConversationListLive.tsx`（客户端刷新壳）
- Create: `src/app/api/me/unread-count/route.ts`
- Create: `src/components/layout/UnreadBadge.tsx`
- Modify: `src/components/layout/SiteHeader.tsx`（头像红点换成 UnreadBadge）
- Modify: `src/app/layout.tsx`（真实未读数）
- Modify: `src/lib/realtime.ts`（会话首条消息时向对方补发 `conversation:new`）
- Test: `tests/realtime/socket.test.ts` 追加 1 条用例

**Interfaces:**
- Consumes: T18 的 `queryConversationsForUser`/`countUnreadMessages`、T19 的 `useSocket`
- Produces:
  - `GET /api/me/unread-count` → `{count: number}`
  - `/chat`：RSC 渲染会话列表（商品缩略图、对方昵称、最后消息预览、未读数、相对时间）；客户端壳监听 `message:new / message:read / conversation:new` → 防抖 `router.refresh()`
  - `conversation:new` 事件：在 `message:send` 里当该消息是会话首条时，向对方 `user:{id}` 房间补发 `{ conversation: { id, itemId } }`
  - 顶栏头像红点：真实未读总数，实时增减

- [ ] **Step 1: realtime 补发 conversation:new + 追加测试**

在 `src/lib/realtime.ts` 的 `message:send` 事务之后（广播 `message:new` 附近）插入：

```ts
        const isFirstMessage = (await prisma.message.count({ where: { conversationId } })) === 1
        if (isFirstMessage) {
          io.to(userRoom(recipientId)).emit('conversation:new', {
            conversation: { id: conversationId, itemId: conversation.itemId },
          })
        }
```

在 `tests/realtime/socket.test.ts` 追加：

```ts
  it('会话首条消息：对方同时收到 conversation:new', async () => {
    const { seller, buyer, conversation } = await seedConversation()
    const buyerSocket = await connect(await createTestSession(buyer.id))
    const sellerSocket = await connect(await createTestSession(seller.id))
    await emitAck(buyerSocket, 'conversation:join', { conversationId: conversation.id })

    const newConversation = new Promise<{ conversation: { id: string } }>((resolve) => {
      sellerSocket.on('conversation:new', resolve)
    })
    await emitAck(buyerSocket, 'message:send', {
      conversationId: conversation.id, type: 'TEXT', content: '第一条消息', clientId: 'first-1',
    })
    const event = await newConversation
    expect(event.conversation.id).toBe(conversation.id)

    buyerSocket.disconnect()
    sellerSocket.disconnect()
  })
```

- [ ] **Step 2: 实现未读计数 API 与顶栏红点**

`src/app/api/me/unread-count/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { countUnreadMessages } from '@/lib/messages'

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser(req)
    return NextResponse.json({ count: await countUnreadMessages(user.id) })
  } catch (err) {
    return errorResponse(err)
  }
}
```

`src/components/layout/UnreadBadge.tsx`：

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSocket } from '@/hooks/useSocket'

export function UnreadBadge({ initialCount }: { initialCount: number }) {
  const { socket } = useSocket()
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    setCount(initialCount) // RSC refresh 后同步
  }, [initialCount])

  useEffect(() => {
    if (!socket) return
    const refresh = async () => {
      const res = await fetch('/api/me/unread-count')
      if (res.ok) setCount((await res.json()).count)
    }
    socket.on('message:new', refresh)
    socket.on('message:read', refresh)
    return () => {
      socket.off('message:new', refresh)
      socket.off('message:read', refresh)
    }
  }, [socket])

  if (count <= 0) return null
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-price px-1 text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}
```

修改 `src/components/layout/SiteHeader.tsx`：import `UnreadBadge`；把已有的红点 JSX 块替换为 `<UnreadBadge initialCount={user.unreadCount} />`。

修改 `src/app/layout.tsx`：import `countUnreadMessages`；把 `const unreadCount = 0 // T20 接入真实未读数` 替换为：

```ts
  const unreadCount = user ? await countUnreadMessages(user.id) : 0
```

- [ ] **Step 3: 实现会话列表页**

`src/components/chat/ConversationListLive.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { useSocket } from '@/hooks/useSocket'

/** 包一层：新消息 / 已读 / 新会话事件到达时，防抖刷新 RSC 列表 */
export function ConversationListLive({ children }: { children: ReactNode }) {
  const { socket } = useSocket()
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!socket) return
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 300)
    }
    socket.on('message:new', refresh)
    socket.on('message:read', refresh)
    socket.on('conversation:new', refresh)
    return () => {
      socket.off('message:new', refresh)
      socket.off('message:read', refresh)
      socket.off('conversation:new', refresh)
    }
  }, [socket, router])

  return <>{children}</>
}
```

`src/app/chat/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ConversationListLive } from '@/components/chat/ConversationListLive'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { getSessionUser } from '@/lib/auth'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import { queryConversationsForUser } from '@/lib/messages'

export default async function ChatListPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fchat')

  const conversations = await queryConversationsForUser(user.id)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-extrabold">消息</h1>
      {conversations.length === 0 ? (
        <EmptyState title="还没有会话" description="去商品页点「聊一聊」开始沟通" iconName="chat" />
      ) : (
        <ConversationListLive>
          <ul className="space-y-2">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/chat/${conversation.id}`}
                  className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card transition hover:shadow-[0_6px_20px_rgba(20,40,80,.13)]"
                >
                  <Avatar src={conversation.other.avatarUrl} name={conversation.other.username} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{conversation.other.username}</span>
                      {conversation.other.verifiedAt && <span className="shrink-0 text-xs font-medium text-brand">已认证</span>}
                      <span className="ml-auto shrink-0 text-xs font-normal text-muted">
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted">{conversation.lastMessagePreview || '开始聊天吧'}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                      {conversation.item.title} · {formatPrice(conversation.item.priceCents)}
                    </p>
                  </div>
                  {conversation.item.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={conversation.item.images[0].url} alt="" className="size-12 shrink-0 rounded-btn object-cover" />
                  )}
                  {conversation.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-price px-1.5 text-[11px] font-bold text-white">
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </ConversationListLive>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test
```

预期：socket 测试（含新增 conversation:new 用例）全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 会话列表（实时刷新）+ 顶栏未读红点 + conversation:new 事件"
```

### Task 21: 消息历史分页 + 断线增量拉取

**Files:**
- Create: `src/app/api/conversations/[id]/messages/route.ts`（GET）
- Modify: `src/components/chat/ChatWindow.tsx`（「加载更早」+ 重连增量）
- Modify: `src/app/chat/[id]/page.tsx`（传 `initialHasMore`）
- Test: `tests/api/messages.test.ts`

**Interfaces:**
- Consumes: T18 的 `MessageData`/`toMessageData`
- Produces:
  - `GET /api/conversations/[id]/messages?limit=30&cursor=<旧消息id>` → `{ messages: MessageData[]（时间升序）, nextCursor: string | null }`；非会话成员 → 404
  - `GET /api/conversations/[id]/messages?after=<ISO时间>`（断线增量）→ 该时间之后的消息（升序，最多 200 条）
  - ChatWindow：顶部「加载更早消息」（保持滚动位置）；socket 重连后按最后消息时间戳拉增量并去重合并

- [ ] **Step 1: 写失败的测试**

`tests/api/messages.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as messagesGET } from '@/app/api/conversations/[id]/messages/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

async function seedConversationWithMessages(count: number) {
  const seller = await createTestUser()
  const buyer = await createTestUser()
  const item = await prisma.item.create({
    data: {
      title: '雅马哈F310', description: '带琴包，音色很好。', priceCents: 35000,
      category: 'INSTRUMENTS', condition: 'LIKE_NEW_90', location: '南区宿舍', sellerId: seller.id,
    },
  })
  const conversation = await prisma.conversation.create({
    data: { itemId: item.id, buyerId: buyer.id, sellerId: seller.id },
  })
  for (let i = 1; i <= count; i += 1) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: buyer.id,
        type: 'TEXT',
        content: `消息${i}`,
        clientId: `c${i}`,
        createdAt: new Date(Date.UTC(2026, 9, 16, 10, i, 0)), // 每条晚 1 分钟，顺序稳定
        readAt: i < count ? new Date() : null,
      },
    })
  }
  return { seller, buyer, conversation }
}

const call = (id: string, token: string | null, query = '') =>
  messagesGET(reqWithCookie(`http://t/api/conversations/${id}/messages?${query}`, token), { params: Promise.resolve({ id }) })

describe('GET /api/conversations/[id]/messages', () => {
  beforeEach(resetDb)

  it('默认返回最近一页（升序）并给出 nextCursor', async () => {
    const { buyer, conversation } = await seedConversationWithMessages(5)
    const token = await createTestSession(buyer.id)
    const res = await call(conversation.id, token, 'limit=2')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messages.map((m: { content: string }) => m.content)).toEqual(['消息4', '消息5'])
    expect(data.nextCursor).toBeTruthy()
  })

  it('用 cursor 翻更早，两页无重叠', async () => {
    const { buyer, conversation } = await seedConversationWithMessages(5)
    const token = await createTestSession(buyer.id)
    const p1 = await (await call(conversation.id, token, 'limit=2')).json()
    const p2 = await (await call(conversation.id, token, `limit=2&cursor=${p1.nextCursor}`)).json()
    expect(p2.messages.map((m: { content: string }) => m.content)).toEqual(['消息2', '消息3'])
    const p3 = await (await call(conversation.id, token, `limit=2&cursor=${p2.nextCursor}`)).json()
    expect(p3.messages.map((m: { content: string }) => m.content)).toEqual(['消息1'])
    expect(p3.nextCursor).toBeNull()
  })

  it('after 参数返回增量（断线重连用）', async () => {
    const { buyer, conversation } = await seedConversationWithMessages(3)
    const token = await createTestSession(buyer.id)
    const after = encodeURIComponent(new Date(Date.UTC(2026, 9, 16, 10, 1, 0)).toISOString())
    const data = await (await call(conversation.id, token, `after=${after}`)).json()
    expect(data.messages.map((m: { content: string }) => m.content)).toEqual(['消息2', '消息3'])
  })

  it('非会话成员 → 404；未登录 → 401', async () => {
    const { conversation } = await seedConversationWithMessages(1)
    const stranger = await createTestUser()
    expect((await call(conversation.id, await createTestSession(stranger.id))).status).toBe(404)
    expect((await call(conversation.id, null)).status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npm test
```

- [ ] **Step 3: 实现消息查询路由**

`src/app/api/conversations/[id]/messages/route.ts`：

```ts
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { messageInclude, toMessageData } from '@/lib/messages'
import { paginationSchema } from '@/lib/validators'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const url = new URL(req.url)

    const conversation = await prisma.conversation.findUnique({ where: { id } })
    // 非成员一律 404，不泄漏会话存在性
    if (!conversation || (conversation.buyerId !== user.id && conversation.sellerId !== user.id)) {
      throw new ApiError('NOT_FOUND', '会话不存在')
    }

    const after = url.searchParams.get('after')
    if (after) {
      const messages = await prisma.message.findMany({
        where: { conversationId: id, createdAt: { gt: new Date(after) } },
        orderBy: { createdAt: 'asc' },
        take: 200,
        include: messageInclude,
      })
      return NextResponse.json({ messages: messages.map(toMessageData), nextCursor: null })
    }

    const { cursor, limit } = paginationSchema.parse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    })

    let where: Prisma.MessageWhereInput = { conversationId: id }
    if (cursor) {
      const anchor = await prisma.message.findUnique({ where: { id: cursor }, select: { createdAt: true } })
      if (anchor) where = { ...where, createdAt: { lt: anchor.createdAt } }
    }

    const rows = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: messageInclude,
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null

    return NextResponse.json({ messages: page.reverse().map(toMessageData), nextCursor })
  } catch (err) {
    return errorResponse(err)
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm test
```

- [ ] **Step 5: ChatWindow 增加「加载更早」与重连增量**

修改 `src/components/chat/ChatWindow.tsx`：

1）props 增加 `initialHasMore: boolean`，组件签名改为：

```tsx
export function ChatWindow({
  conversationId,
  currentUserId,
  other,
  item,
  initialMessages,
  initialHasMore,
}: ChatWindowProps & { initialHasMore: boolean }) {
```

2）状态与 ref 增加：

```tsx
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const hasConnectedRef = useRef(false)
```

3）把消息流容器加上 ref：`<div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">`

4）在滚动容器顶部（消息列表之前）插入：

```tsx
        {hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={async () => {
                const oldest = messagesRef.current.find((m) => !m.id.startsWith('local-'))
                if (!oldest || !scrollRef.current) return
                setLoadingMore(true)
                const previousHeight = scrollRef.current.scrollHeight
                const res = await fetch(`/api/conversations/${conversationId}/messages?cursor=${oldest.id}`)
                setLoadingMore(false)
                if (!res.ok) return
                const data: { messages: MessageData[]; nextCursor: string | null } = await res.json()
                setMessages((prev) => [...data.messages, ...prev])
                setHasMore(data.nextCursor !== null)
                requestAnimationFrame(() => {
                  if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight - previousHeight
                  }
                })
              }}
              className="rounded-full bg-bg px-3 py-1 text-xs text-muted hover:text-ink"
            >
              {loadingMore ? '加载中…' : '加载更早消息'}
            </button>
          </div>
        )}
```

5）新增重连增量 effect（放在其它 useEffect 之后）：

```tsx
  // 断线重连后按最后消息时间戳拉增量，一条不丢（Spec §5.2 第 7 步）
  useEffect(() => {
    if (!socket) return
    const onConnect = async () => {
      if (hasConnectedRef.current) {
        const last = [...messagesRef.current].reverse().find((m) => !m.id.startsWith('local-'))
        if (last) {
          const res = await fetch(
            `/api/conversations/${conversationId}/messages?after=${encodeURIComponent(last.createdAt)}`,
          )
          if (res.ok) {
            const data: { messages: MessageData[] } = await res.json()
            if (data.messages.length > 0) {
              setMessages((prev) => {
                const known = new Set(prev.map((m) => m.id))
                return [...prev, ...data.messages.filter((m) => !known.has(m.id))]
              })
              socket.emit('message:read', { conversationId })
            }
          }
        }
      }
      hasConnectedRef.current = true
    }
    socket.on('connect', onConnect)
    return () => {
      socket.off('connect', onConnect)
    }
  }, [socket, conversationId])
```

6）文件顶部 import 确保包含 `useRef`（若原 import 没有）。

修改 `src/app/chat/[id]/page.tsx`：查询总消息数并传参：

```ts
  const total = await prisma.message.count({ where: { conversationId: id } })
  const initialHasMore = total > 30
```

并给 `<ChatWindow … />` 增加 `initialHasMore={initialHasMore}`。

- [ ] **Step 6: 运行测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat: 聊天历史分页（保持滚动位置）+ 断线重连增量拉取"
```

---

## 阶段 5：学生认证审核 + 举报 + 管理后台

### Task 22: 学生认证提交

**Files:**
- Create: `src/app/api/verifications/route.ts`（POST）
- Create: `src/components/me/VerificationForm.tsx`（客户端）
- Create: `src/app/me/verification/page.tsx`（RSC：状态展示 + 表单）
- Test: `tests/api/verifications.test.ts`

**Interfaces:**
- Consumes: T4 的 `verificationSchema`、T10 的上传管线、T6 守卫
- Produces:
  - `POST /api/verifications` → 200 `{request:{id,status:'PENDING'}}`；**已认证 409；已有 PENDING 申请 409（Review Focus #1 重复提交）**；字段级校验沿用 zod
  - `/me/verification`：展示四种状态（未认证 / 待审核 / 已认证 / 最近一次被驳回+理由），可提交或重新提交

- [ ] **Step 1: 写失败的测试**

`tests/api/verifications.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { POST as verificationPOST } from '@/app/api/verifications/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const validBody = { studentNo: '2023010101', proofImageUrl: '/uploads/2026/card.webp' }

const call = (token: string | null, body: unknown) =>
  verificationPOST(reqWithCookie('http://t/api/verifications', token, { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/verifications', () => {
  beforeEach(resetDb)

  it('提交成功：PENDING 入库', async () => {
    const user = await createTestUser()
    const res = await call(await createTestSession(user.id), validBody)
    expect(res.status).toBe(200)
    expect((await res.json()).request.status).toBe('PENDING')
    expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(1)
  })

  it('已有待审核申请时重复提交 → 409（Review Focus #1）', async () => {
    const user = await createTestUser()
    const token = await createTestSession(user.id)
    await call(token, validBody)
    expect((await call(token, validBody)).status).toBe(409)
    expect(await prisma.verificationRequest.count()).toBe(1)
  })

  it('已认证用户再提交 → 409', async () => {
    const user = await createTestUser({ verifiedAt: new Date() })
    expect((await call(await createTestSession(user.id), validBody)).status).toBe(409)
  })

  it('被驳回后可以重新提交', async () => {
    const user = await createTestUser()
    const token = await createTestSession(user.id)
    await prisma.verificationRequest.create({
      data: { userId: user.id, studentNo: '1', proofImageUrl: '/uploads/x.webp', status: 'REJECTED', rejectReason: '照片不清晰' },
    })
    expect((await call(token, validBody)).status).toBe(200)
  })

  it('学号过短 → 400；未登录 → 401', async () => {
    const user = await createTestUser()
    const token = await createTestSession(user.id)
    expect((await call(token, { ...validBody, studentNo: '1' })).status).toBe(400)
    expect((await call(null, validBody)).status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行确认失败 → 实现 → 通过**

`src/app/api/verifications/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { verificationSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    if (user.verifiedAt) throw new ApiError('CONFLICT', '你已经通过学生认证了')

    const pending = await prisma.verificationRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    })
    if (pending) throw new ApiError('CONFLICT', '你有一条待审核的申请，请耐心等待')

    const input = verificationSchema.parse(await readJson(req))
    const request = await prisma.verificationRequest.create({
      data: { userId: user.id, studentNo: input.studentNo, proofImageUrl: input.proofImageUrl },
    })
    return NextResponse.json({ request: { id: request.id, status: request.status } })
  } catch (err) {
    return errorResponse(err)
  }
}
```

```bash
npm test
```

- [ ] **Step 3: 实现认证页**

`src/components/me/VerificationForm.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'

export function VerificationForm() {
  const router = useRouter()
  const toast = useToast()
  const { request } = useApi()
  const [proof, setProof] = useState<{ url: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    setUploading(false)
    if (res.status === 401) {
      toast.error('登录已过期，请重新登录')
      router.push('/login?next=%2Fme%2Fverification')
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      toast.error(body?.error?.message ?? '图片上传失败')
      return
    }
    setProof(await res.json())
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    if (!proof) {
      toast.error('请上传学生证照片')
      return
    }
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const result = await request('/api/verifications', {
      method: 'POST',
      body: JSON.stringify({ studentNo: form.get('studentNo'), proofImageUrl: proof.url }),
    })
    setLoading(false)
    if (result.ok) {
      toast.success('已提交，等待管理员审核')
      router.refresh()
    } else if (result.fields) {
      setFieldErrors(result.fields)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="学号" name="studentNo" required minLength={4} maxLength={20} placeholder="例如 2023010101"
        error={fieldErrors.studentNo} />
      <div>
        <span className="mb-1 block text-sm font-medium">学生证照片（含姓名与学号页）</span>
        <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-btn border border-dashed border-line bg-white text-sm text-muted hover:border-brand hover:text-brand">
          {proof ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proof.url} alt="学生证" className="h-full w-full rounded-btn object-contain p-2" />
          ) : (
            <>
              <Icon name="image" size={22} />
              {uploading ? '上传中…' : '点击上传'}
            </>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        </label>
      </div>
      <Button type="submit" loading={loading} className="w-full">提交认证</Button>
    </form>
  )
}
```

`src/app/me/verification/page.tsx`：

```tsx
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VerificationForm } from '@/components/me/VerificationForm'
import { Icon } from '@/components/ui/Icon'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function VerificationPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fme%2Fverification')

  const latest = await prisma.verificationRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="mx-auto max-w-md">
      <Link href="/me" className="text-sm text-muted hover:text-brand">‹ 返回个人中心</Link>
      <h1 className="mb-5 mt-2 text-xl font-extrabold">学生认证</h1>

      {user.verifiedAt ? (
        <div className="rounded-card bg-surface p-5 text-center shadow-card">
          <span className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-[#e6f6f1] text-brand">
            <Icon name="shield" size={28} />
          </span>
          <p className="font-semibold">已通过学生认证</p>
          <p className="mt-1 text-sm text-muted">{formatRelativeTime(user.verifiedAt)}认证成功，认证徽章已亮起</p>
        </div>
      ) : latest?.status === 'PENDING' ? (
        <div className="rounded-card bg-surface p-5 text-center shadow-card">
          <p className="font-semibold">申请审核中</p>
          <p className="mt-1 text-sm text-muted">{formatRelativeTime(latest.createdAt)}提交，请耐心等待管理员审核</p>
        </div>
      ) : (
        <>
          {latest?.status === 'REJECTED' && (
            <div className="mb-4 rounded-card bg-[#fdf3e0] p-3 text-sm text-[#b07407]">
              上次申请被驳回：{latest.rejectReason ?? '资料不清晰'}。修改后可重新提交。
            </div>
          )}
          <p className="mb-4 text-sm text-muted">认证后商品与主页会显示「已认证」徽章，更容易获得信任。</p>
          <VerificationForm />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 运行测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat: 学生认证提交（防重复提交、驳回后可重申）+ 认证状态页"
```

---

### Task 23: 举报（商品 / 用户）

**Files:**
- Create: `src/app/api/reports/route.ts`（POST）
- Create: `src/components/report/ReportButton.tsx`（客户端：内联展开的理由表单）
- Modify: `src/app/items/[id]/page.tsx`（详情页底部加商品举报）
- Modify: `src/app/users/[id]/page.tsx`（资料头加用户举报）
- Test: `tests/api/reports.test.ts`

**Interfaces:**
- Consumes: T4 的 `reportSchema`、T6 守卫
- Produces:
  - `POST /api/reports` `{targetType:'ITEM'|'USER', targetId, reason}` → 200 `{ok:true}`；目标不存在 404；**同一人 24h 内重复举报同一目标 409**；未登录 401
  - `ReportButton({ targetType, targetId, isLoggedIn })`：点击展开 textarea + 提交；未登录跳登录页

- [ ] **Step 1: 写失败的测试**

`tests/api/reports.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { POST as reportPOST } from '@/app/api/reports/route'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const call = (token: string | null, body: unknown) =>
  reportPOST(reqWithCookie('http://t/api/reports', token, { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/reports', () => {
  beforeEach(resetDb)

  it('举报商品成功入库 PENDING', async () => {
    const seller = await createTestUser()
    const item = await prisma.item.create({
      data: {
        title: '违规商品', description: '这是个违规商品描述。', priceCents: 100,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: seller.id,
      },
    })
    const reporter = await createTestUser()
    const res = await call(await createTestSession(reporter.id), {
      targetType: 'ITEM', targetId: item.id, reason: '疑似违禁物品',
    })
    expect(res.status).toBe(200)
    expect(await prisma.report.count({ where: { status: 'PENDING' } })).toBe(1)
  })

  it('24 小时内重复举报同一目标 → 409', async () => {
    const seller = await createTestUser()
    const reporter = await createTestUser()
    const token = await createTestSession(reporter.id)
    const body = { targetType: 'USER', targetId: seller.id, reason: '骚扰信息不断' }
    expect((await call(token, body)).status).toBe(200)
    expect((await call(token, body)).status).toBe(409)
    expect(await prisma.report.count()).toBe(1)
  })

  it('目标不存在 → 404；理由过短 → 400；未登录 → 401', async () => {
    const reporter = await createTestUser()
    const token = await createTestSession(reporter.id)
    expect((await call(token, { targetType: 'ITEM', targetId: 'nope', reason: '虚假商品信息' })).status).toBe(404)
    expect((await call(token, { targetType: 'ITEM', targetId: 'nope', reason: '短' })).status).toBe(400)
    expect((await call(null, { targetType: 'ITEM', targetId: 'nope', reason: '虚假商品信息' })).status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行确认失败 → 实现 → 通过**

`src/app/api/reports/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { reportSchema } from '@/lib/validators'

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const input = reportSchema.parse(await readJson(req))

    const target =
      input.targetType === 'ITEM'
        ? await prisma.item.findUnique({ where: { id: input.targetId }, select: { id: true } })
        : await prisma.user.findUnique({ where: { id: input.targetId }, select: { id: true } })
    if (!target) throw new ApiError('NOT_FOUND', '举报目标不存在')

    const recent = await prisma.report.findFirst({
      where: {
        reporterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        createdAt: { gt: new Date(Date.now() - DAY_MS) },
      },
    })
    if (recent) throw new ApiError('CONFLICT', '你已举报过该对象，管理员会尽快处理')

    await prisma.report.create({
      data: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
```

```bash
npm test
```

- [ ] **Step 3: 实现 ReportButton 并接入两处**

`src/components/report/ReportButton.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'

export function ReportButton({
  targetType,
  targetId,
  isLoggedIn,
}: {
  targetType: 'ITEM' | 'USER'
  targetId: string
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const { request } = useApi()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted underline-offset-2 hover:text-[#d94f3d] hover:underline"
        onClick={() => {
          if (!isLoggedIn) {
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
            return
          }
          setOpen(true)
        }}
      >
        举报
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-btn bg-bg p-3">
      <Textarea name="report-reason" rows={2} maxLength={500} placeholder="请描述举报理由（5–500 字）"
        value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
        <Button
          variant="danger"
          loading={loading}
          disabled={reason.trim().length < 5}
          onClick={async () => {
            setLoading(true)
            const result = await request('/api/reports', {
              method: 'POST',
              body: JSON.stringify({ targetType, targetId, reason }),
            })
            setLoading(false)
            if (result.ok) {
              toast.success('已提交举报，管理员会尽快处理')
              setOpen(false)
              setReason('')
            }
          }}
        >
          提交举报
        </Button>
      </div>
    </div>
  )
}
```

接入详情页：在商品描述卡片之后加一行：

```tsx
        <div className="text-right">
          <ReportButton targetType="ITEM" targetId={item.id} isLoggedIn={Boolean(user)} />
        </div>
```

接入用户主页：资料头右侧加：

```tsx
        <ReportButton targetType="USER" targetId={user.id} isLoggedIn={Boolean(currentUser)} />
```

（`/users/[id]/page.tsx` 需要读 session 拿 `currentUser`：加 `const sessionUser = await getSessionUser((await cookies()).toString())`，传 `isLoggedIn={Boolean(sessionUser)}`。）

- [ ] **Step 4: 运行测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat: 举报（商品/用户，24h 防重复）+ 两处入口"
```

### Task 24: 后台布局（requireAdmin 守卫）+ 仪表盘

**Files:**
- Create: `src/lib/admin.ts`（统计查询）
- Create: `src/app/admin/layout.tsx`（RSC 守卫 + 侧边导航）
- Create: `src/app/admin/page.tsx`（仪表盘）
- Create: `src/components/admin/MiniBarChart.tsx`
- Test: `tests/lib/admin-stats.test.ts`

**Interfaces:**
- Consumes: T3 prisma、T6 的 `getSessionUser`
- Produces:
  - `queryDashboardStats(): Promise<DashboardStats>`：`{ userCount, onSaleCount, messageCount, pendingVerifications, pendingReports, newItemsByDay: {label,value}[], newUsersByDay: {label,value}[] }`（近 7 天，label 形如 `10-10`）
  - `MiniBarChart({ title, data })`：**纯 CSS 柱状图（零图表依赖）**
  - `/admin/layout.tsx`：未登录 → `/login?next=%2Fadmin`；非管理员 → 重定向 `/`（不暴露后台存在）
  - `/admin` 仪表盘：5 张统计卡 + 两张柱状图

- [ ] **Step 1: 写失败的测试**

`tests/lib/admin-stats.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { queryDashboardStats } from '@/lib/admin'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestUser } from '../helpers/factory'

describe('queryDashboardStats', () => {
  beforeEach(resetDb)

  it('计数正确、7 天序列长度为 7 且包含今天的增量', async () => {
    const user = await createTestUser()
    await prisma.item.create({
      data: {
        title: '在售商品', description: '这是一个在售商品。', priceCents: 100,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: user.id,
      },
    })
    await prisma.item.create({
      data: {
        title: '已售商品', description: '这是一个已售商品。', priceCents: 100,
        category: 'OTHER', condition: 'NEW', location: '东区', sellerId: user.id, status: 'SOLD',
      },
    })
    await prisma.verificationRequest.create({
      data: { userId: user.id, studentNo: '1', proofImageUrl: '/uploads/x.webp' },
    })

    const stats = await queryDashboardStats()
    expect(stats.userCount).toBe(1)
    expect(stats.onSaleCount).toBe(1)
    expect(stats.pendingVerifications).toBe(1)
    expect(stats.pendingReports).toBe(0)
    expect(stats.newItemsByDay).toHaveLength(7)
    expect(stats.newUsersByDay).toHaveLength(7)
    expect(stats.newItemsByDay.at(-1)?.value).toBe(2) // 今天新增 2 件
    expect(stats.newUsersByDay.at(-1)?.value).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败 → 实现 src/lib/admin.ts → 通过**

```ts
import { prisma } from '@/lib/db'

export interface DayCount {
  label: string // MM-DD
  value: number
}

export interface DashboardStats {
  userCount: number
  onSaleCount: number
  messageCount: number
  pendingVerifications: number
  pendingReports: number
  newItemsByDay: DayCount[]
  newUsersByDay: DayCount[]
}

function last7Days(): { label: string; start: Date; end: Date }[] {
  const days: { label: string; start: Date; end: Date }[] = []
  const now = new Date()
  for (let offset = 6; offset >= 0; offset -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const label = `${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    days.push({ label, start, end })
  }
  return days
}

export async function queryDashboardStats(): Promise<DashboardStats> {
  const days = last7Days()
  const weekStart = days[0].start

  const [userCount, onSaleCount, messageCount, pendingVerifications, pendingReports, weekItems, weekUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.item.count({ where: { status: 'ON_SALE' } }),
      prisma.message.count(),
      prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.item.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    ])

  const bucket = (dates: { createdAt: Date }[]): DayCount[] =>
    days.map((day) => ({
      label: day.label,
      value: dates.filter((d) => d.createdAt >= day.start && d.createdAt < day.end).length,
    }))

  return {
    userCount,
    onSaleCount,
    messageCount,
    pendingVerifications,
    pendingReports,
    newItemsByDay: bucket(weekItems),
    newUsersByDay: bucket(weekUsers),
  }
}
```

```bash
npm test
```

- [ ] **Step 3: 实现后台布局、仪表盘与柱状图**

`src/app/admin/layout.tsx`：

```tsx
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'

const NAV = [
  { href: '/admin', label: '仪表盘' },
  { href: '/admin/verifications', label: '认证审核' },
  { href: '/admin/items', label: '商品管理' },
  { href: '/admin/users', label: '用户管理' },
  { href: '/admin/reports', label: '举报处理' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fadmin')
  if (user.role !== 'ADMIN') redirect('/')

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex shrink-0 gap-2 lg:w-40 lg:flex-col">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-btn px-3 py-2 text-sm font-medium text-muted transition hover:bg-white hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
```

`src/components/admin/MiniBarChart.tsx`：

```tsx
export function MiniBarChart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <div className="flex h-32 items-stretch gap-2">
        {data.map((day) => (
          <div key={day.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-muted">{day.value}</span>
            <div
              className="w-full rounded-t bg-brand/75"
              style={{ height: `${Math.max(4, Math.round((day.value / max) * 100))}%` }}
            />
            <span className="text-[10px] text-muted">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

`src/app/admin/page.tsx`：

```tsx
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
```

- [ ] **Step 4: 运行测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat: 管理后台布局（管理员守卫）+ 仪表盘（纯 CSS 柱状图）"
```

---

### Task 25: 后台四个管理页 + Admin API

**Files:**
- Create: `src/app/api/admin/verifications/[id]/route.ts`（PATCH）
- Create: `src/app/api/admin/users/[id]/route.ts`（PATCH）
- Create: `src/app/api/admin/reports/[id]/route.ts`（PATCH）
- Create: `src/components/admin/AdminActionButton.tsx` · `RejectReasonButton.tsx`
- Create: `src/app/admin/verifications/page.tsx` · `items/page.tsx` · `users/page.tsx` · `reports/page.tsx`
- Modify: `src/lib/validators.ts`（追加 `userBanSchema`）
- Test: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: T24 的后台布局、T6 的 `requireAdmin`、T4 的 `verificationReviewSchema`、T16 的商品状态接口（管理员下架复用 `PATCH /api/items/[id]/status`）
- Produces:
  - `PATCH /api/admin/verifications/[id]` `{action:'APPROVE'} | {action:'REJECT', reason}` → 通过时事务写 `VerificationRequest.APPROVED` + `User.verifiedAt=now`；**管理员不能审核自己的申请 403（Review Focus #5）**
  - `PATCH /api/admin/users/[id]` `{action:'BAN'|'UNBAN'}`（`userBanSchema` 追加到 validators）→ 封禁时事务改状态 + 删除该用户全部 Session；**不能封禁任何 ADMIN 账号（含自己）→ 403（Review Focus #5）**
  - `PATCH /api/admin/reports/[id]` `{action:'RESOLVE'|'DISMISS'}` → 写状态 + `handledAt`
  - 以上全部 `requireAdmin` + `ensureSameOrigin`；非管理员 403
  - 四个管理页：认证审核（通过 / 驳回填理由）、商品管理（搜索 + 管理员下架）、用户管理（搜索 + 封禁/解封）、举报处理（查看目标 + 受理/驳回）

- [ ] **Step 1: validators 追加 + 写失败的测试**

`src/lib/validators.ts` 末尾追加：

```ts
export const userBanSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('BAN') }),
  z.object({ action: z.literal('UNBAN') }),
])
```

`tests/api/admin.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as reportPATCH } from '@/app/api/admin/reports/[id]/route'
import { PATCH as userPATCH } from '@/app/api/admin/users/[id]/route'
import { PATCH as verificationPATCH } from '@/app/api/admin/verifications/[id]/route'
import { createSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resetDb } from '../helpers/db'
import { createTestSession, createTestUser, reqWithCookie } from '../helpers/factory'

const patch = (route: typeof verificationPATCH, url: string, token: string | null, body: unknown, id: string) =>
  route(reqWithCookie(url, token, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

describe('认证审核', () => {
  beforeEach(resetDb)

  it('通过：申请 APPROVED 且用户 verifiedAt 置位', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const applicant = await createTestUser()
    const request = await prisma.verificationRequest.create({
      data: { userId: applicant.id, studentNo: '2023010101', proofImageUrl: '/uploads/card.webp' },
    })
    const res = await patch(verificationPATCH, `http://t/api/admin/verifications/${request.id}`, await createTestSession(admin.id), { action: 'APPROVE' }, request.id)
    expect(res.status).toBe(200)
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('APPROVED')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: applicant.id } })).verifiedAt).not.toBeNull()
  })

  it('驳回必须带理由；管理员不能审核自己的申请（Review Focus #5）', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const token = await createTestSession(admin.id)
    const own = await prisma.verificationRequest.create({
      data: { userId: admin.id, studentNo: 'x', proofImageUrl: '/uploads/x.webp' },
    })
    expect((await patch(verificationPATCH, 'http://t/x', token, { action: 'APPROVE' }, own.id)).status).toBe(403)

    const applicant = await createTestUser()
    const request = await prisma.verificationRequest.create({
      data: { userId: applicant.id, studentNo: 'y', proofImageUrl: '/uploads/y.webp' },
    })
    expect((await patch(verificationPATCH, 'http://t/x', token, { action: 'REJECT' }, request.id)).status).toBe(400)
    const rejected = await patch(verificationPATCH, 'http://t/x', token, { action: 'REJECT', reason: '照片不清晰' }, request.id)
    expect(rejected.status).toBe(200)
    const fresh = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(fresh.status).toBe('REJECTED')
    expect(fresh.rejectReason).toBe('照片不清晰')
  })

  it('非管理员 → 403', async () => {
    const user = await createTestUser()
    expect((await patch(verificationPATCH, 'http://t/x', await createTestSession(user.id), { action: 'APPROVE' }, 'any')).status).toBe(403)
  })
})

describe('用户封禁', () => {
  beforeEach(resetDb)

  it('封禁普通用户：状态 BANNED 且 Session 全清', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const target = await createTestUser()
    await createSession(target.id)
    const res = await patch(userPATCH, 'http://t/x', await createTestSession(admin.id), { action: 'BAN' }, target.id)
    expect(res.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('BANNED')
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0)
  })

  it('不能封禁管理员（含自己）→ 403（Review Focus #5）', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const anotherAdmin = await createTestUser({ role: 'ADMIN' })
    const token = await createTestSession(admin.id)
    expect((await patch(userPATCH, 'http://t/x', token, { action: 'BAN' }, admin.id)).status).toBe(403)
    expect((await patch(userPATCH, 'http://t/x', token, { action: 'BAN' }, anotherAdmin.id)).status).toBe(403)
  })

  it('解封恢复 ACTIVE', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const target = await createTestUser({ status: 'BANNED' })
    const res = await patch(userPATCH, 'http://t/x', await createTestSession(admin.id), { action: 'UNBAN' }, target.id)
    expect(res.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('ACTIVE')
  })
})

describe('举报处理', () => {
  beforeEach(resetDb)

  it('受理与驳回都写 handledAt', async () => {
    const admin = await createTestUser({ role: 'ADMIN' })
    const reporter = await createTestUser()
    const target = await createTestUser()
    const token = await createTestSession(admin.id)
    const report = await prisma.report.create({
      data: { reporterId: reporter.id, targetType: 'USER', targetId: target.id, reason: '骚扰信息' },
    })
    expect((await patch(reportPATCH, 'http://t/x', token, { action: 'RESOLVE' }, report.id)).status).toBe(200)
    const fresh = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(fresh.status).toBe('RESOLVED')
    expect(fresh.handledAt).not.toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败 → 实现三个 Admin API → 通过**

`src/app/api/admin/verifications/[id]/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { verificationReviewSchema } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const admin = await requireAdmin(req)
    const { id } = await ctx.params
    const input = verificationReviewSchema.parse(await readJson(req))

    const request = await prisma.verificationRequest.findUnique({ where: { id } })
    if (!request) throw new ApiError('NOT_FOUND', '申请不存在')
    if (request.userId === admin.id) throw new ApiError('FORBIDDEN', '不能审核自己的认证申请')
    if (request.status !== 'PENDING') throw new ApiError('CONFLICT', '该申请已处理过')

    if (input.action === 'APPROVE') {
      await prisma.$transaction([
        prisma.verificationRequest.update({
          where: { id },
          data: { status: 'APPROVED', reviewedAt: new Date() },
        }),
        prisma.user.update({ where: { id: request.userId }, data: { verifiedAt: new Date() } }),
      ])
    } else {
      await prisma.verificationRequest.update({
        where: { id },
        data: { status: 'REJECTED', rejectReason: input.reason, reviewedAt: new Date() },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
```

`src/app/api/admin/users/[id]/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { userBanSchema } from '@/lib/validators'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    await requireAdmin(req)
    const { id } = await ctx.params
    const input = userBanSchema.parse(await readJson(req))

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) throw new ApiError('NOT_FOUND', '用户不存在')

    if (input.action === 'BAN') {
      if (target.role === 'ADMIN') throw new ApiError('FORBIDDEN', '不能封禁管理员账号') // 防自锁（Review Focus #5）
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { status: 'BANNED' } }),
        prisma.session.deleteMany({ where: { userId: id } }), // 现有登录态立即失效
      ])
    } else {
      await prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
```

`src/app/api/admin/reports/[id]/route.ts`：

```ts
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'

const adminReportActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('RESOLVE') }),
  z.object({ action: z.literal('DISMISS') }),
])

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    await requireAdmin(req)
    const { id } = await ctx.params
    const input = adminReportActionSchema.parse(await readJson(req))

    const report = await prisma.report.findUnique({ where: { id } })
    if (!report) throw new ApiError('NOT_FOUND', '举报不存在')
    if (report.status !== 'PENDING') throw new ApiError('CONFLICT', '该举报已处理过')

    await prisma.report.update({
      where: { id },
      data: { status: input.action === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED', handledAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
```

```bash
npm test
```

- [ ] **Step 3: 实现后台通用按钮组件**

`src/components/admin/AdminActionButton.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'

export function AdminActionButton({
  label,
  url,
  body,
  variant = 'secondary',
  confirmText,
}: {
  label: string
  url: string
  body: Record<string, unknown>
  variant?: 'primary' | 'secondary' | 'danger'
  confirmText?: string
}) {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)

  return (
    <Button
      variant={variant}
      loading={loading}
      onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return
        setLoading(true)
        const result = await request(url, { method: 'PATCH', body: JSON.stringify(body) })
        setLoading(false)
        if (result.ok) router.refresh()
      }}
    >
      {label}
    </Button>
  )
}
```

`src/components/admin/RejectReasonButton.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/lib/client-api'

export function RejectReasonButton({ url }: { url: string }) {
  const router = useRouter()
  const { request } = useApi()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return <Button variant="ghost" onClick={() => setOpen(true)}>驳回</Button>
  }
  return (
    <span className="flex items-center gap-2">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="驳回理由（必填）"
        className="rounded-btn border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
      <Button
        variant="danger"
        loading={loading}
        disabled={reason.trim().length < 2}
        onClick={async () => {
          setLoading(true)
          const result = await request(url, { method: 'PATCH', body: JSON.stringify({ action: 'REJECT', reason }) })
          setLoading(false)
          if (result.ok) router.refresh()
        }}
      >
        确认驳回
      </Button>
    </span>
  )
}
```

- [ ] **Step 4: 实现四个管理页**

`src/app/admin/verifications/page.tsx`：

```tsx
import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { RejectReasonButton } from '@/components/admin/RejectReasonButton'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function AdminVerificationsPage() {
  const requests = await prisma.verificationRequest.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // PENDING 排前
    take: 50,
    include: { user: { select: { id: true, username: true, avatarUrl: true, verifiedAt: true } } },
  })
  const pending = requests.filter((r) => r.status === 'PENDING')
  const handled = requests.filter((r) => r.status !== 'PENDING')

  return (
    <div>
      <h1 className="mb-5 text-xl font-extrabold">认证审核</h1>
      {pending.length === 0 ? (
        <EmptyState title="没有待审核的申请" description="新的申请会出现在这里" />
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-4 rounded-card bg-surface p-4 shadow-card">
              <Avatar src={request.user.avatarUrl} name={request.user.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{request.user.username}</p>
                <p className="text-xs text-muted">学号 {request.studentNo} · {formatRelativeTime(request.createdAt)}提交</p>
              </div>
              <a href={request.proofImageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={request.proofImageUrl} alt="学生证" className="h-14 rounded-btn object-cover" />
              </a>
              <div className="flex items-center gap-2">
                <AdminActionButton label="通过" url={`/api/admin/verifications/${request.id}`} body={{ action: 'APPROVE' }} />
                <RejectReasonButton url={`/api/admin/verifications/${request.id}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {handled.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-bold text-muted">最近处理</h2>
          <ul className="space-y-2 text-sm text-muted">
            {handled.slice(0, 10).map((request) => (
              <li key={request.id} className="rounded-card bg-surface px-4 py-2 shadow-card">
                {request.user.username} · {request.status === 'APPROVED' ? '已通过' : `已驳回（${request.rejectReason}）`}
                · {request.reviewedAt ? formatRelativeTime(request.reviewedAt) : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

`src/app/admin/items/page.tsx`：

```tsx
import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ItemStatus } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { formatPrice, formatRelativeTime } from '@/lib/format'

export default async function AdminItemsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const keyword = q?.trim()
  const items = await prisma.item.findMany({
    where: keyword
      ? { OR: [{ title: { contains: keyword } }, { seller: { username: { contains: keyword } } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { seller: { select: { username: true } }, images: { orderBy: { sort: 'asc' }, take: 1 } },
  })

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">商品管理</h1>
      <form method="get" className="mb-4">
        <input name="q" defaultValue={keyword} placeholder="按标题或卖家昵称搜索"
          className="w-full max-w-sm rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
      </form>
      {items.length === 0 ? (
        <EmptyState title="没有找到商品" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-3 shadow-card">
              {item.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.images[0].url} alt="" className="size-12 rounded-btn object-cover" />
              ) : (
                <div className="size-12 rounded-btn bg-[#e8edf3]" />
              )}
              <div className="min-w-0 flex-1">
                <a href={`/items/${item.id}`} target="_blank" rel="noreferrer" className="line-clamp-1 text-sm font-semibold hover:text-brand">
                  {item.title}
                </a>
                <p className="text-xs text-muted">
                  {item.seller.username} · {formatPrice(item.priceCents)} · {formatRelativeTime(item.createdAt)}发布
                </p>
              </div>
              <StatusBadge status={item.status as ItemStatus} />
              {item.status !== 'SOLD' && item.status !== 'DELISTED' && (
                <AdminActionButton
                  label="下架"
                  variant="danger"
                  url={`/api/items/${item.id}/status`}
                  body={{ action: 'DELIST' }}
                  confirmText="确认下架该商品？管理员下架后卖家不能重新上架。"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

`src/app/admin/users/page.tsx`：

```tsx
import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const keyword = q?.trim()
  const users = await prisma.user.findMany({
    where: keyword
      ? { OR: [{ username: { contains: keyword } }, { email: { contains: keyword } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">用户管理</h1>
      <form method="get" className="mb-4">
        <input name="q" defaultValue={keyword} placeholder="按昵称或邮箱搜索"
          className="w-full max-w-sm rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
      </form>
      {users.length === 0 ? (
        <EmptyState title="没有找到用户" />
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
              <Avatar src={user.avatarUrl} name={user.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {user.username}
                  {user.role === 'ADMIN' && <span className="ml-2 rounded-full bg-[#eef2f7] px-2 py-0.5 text-xs text-muted">管理员</span>}
                  {user.status === 'BANNED' && <span className="ml-2 rounded-full bg-[#ffe9e5] px-2 py-0.5 text-xs text-[#d94f3d]">已封禁</span>}
                </p>
                <p className="text-xs text-muted">{user.email} · {formatRelativeTime(user.createdAt)}加入</p>
              </div>
              {user.role !== 'ADMIN' && user.status === 'ACTIVE' && (
                <AdminActionButton label="封禁" variant="danger" url={`/api/admin/users/${user.id}`} body={{ action: 'BAN' }}
                  confirmText={`确认封禁 ${user.username}？其登录状态会立即失效。`} />
              )}
              {user.status === 'BANNED' && (
                <AdminActionButton label="解封" url={`/api/admin/users/${user.id}`} body={{ action: 'UNBAN' }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

`src/app/admin/reports/page.tsx`：

```tsx
import { AdminActionButton } from '@/components/admin/AdminActionButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { prisma } from '@/lib/db'
import { formatRelativeTime } from '@/lib/format'

export default async function AdminReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: { reporter: { select: { username: true } } },
  })
  const pending = reports.filter((r) => r.status === 'PENDING')

  const targetInfo = async (report: (typeof reports)[number]) => {
    if (report.targetType === 'ITEM') {
      const item = await prisma.item.findUnique({ where: { id: report.targetId }, select: { title: true } })
      return { label: item ? `商品《${item.title}》` : '商品（已删除）', href: `/items/${report.targetId}` }
    }
    const user = await prisma.user.findUnique({ where: { id: report.targetId }, select: { username: true } })
    return { label: user ? `用户 ${user.username}` : '用户（已删除）', href: `/users/${report.targetId}` }
  }

  const rows = await Promise.all(pending.map(async (report) => ({ report, target: await targetInfo(report) })))

  return (
    <div>
      <h1 className="mb-5 text-xl font-extrabold">举报处理</h1>
      {rows.length === 0 ? (
        <EmptyState title="没有待处理的举报" />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ report, target }) => (
            <li key={report.id} className="rounded-card bg-surface p-4 shadow-card">
              <p className="text-sm">
                <span className="text-muted">{report.reporter.username} 举报</span>{' '}
                <a href={target.href} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                  {target.label}
                </a>
                <span className="ml-2 text-xs text-muted">{formatRelativeTime(report.createdAt)}</span>
              </p>
              <p className="mt-1 text-sm text-ink/90">{report.reason}</p>
              <div className="mt-2 flex gap-2">
                <AdminActionButton label="受理" url={`/api/admin/reports/${report.id}`} body={{ action: 'RESOLVE' }} />
                <AdminActionButton label="驳回" variant="ghost" url={`/api/admin/reports/${report.id}`} body={{ action: 'DISMISS' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 运行测试 + 提交**

```bash
npm test
git add -A
git commit -m "feat: 后台四页（认证审核/商品/用户/举报）+ Admin API（防自锁、封禁清会话）"
```

## 阶段 6：收尾

### Task 26: seed 演示数据（本地生成图片，不联网）

**Files:**
- Create: `src/lib/seed-assets.ts`（sharp 生成占位图与几何头像）
- Create: `prisma/seed.ts`（**相对路径导入**，不依赖 tsx 的 paths 解析）
- Modify: `package.json`（scripts + prisma.seed 配置）
- Test: `tests/seed/seed.test.ts`

**Interfaces:**
- Consumes: T3 的数据模型、T4 的常量
- Produces:
  - `generateItemImage(category, seed, outDir): Promise<{url,width,height}>`（确定性伪随机、每个分类一套渐变配色、高宽比混合 800×(600|800|1000)）
  - `generateAvatar(name, outDir): Promise<string>`（对称几何 identicon）
  - `package.json`：`"db:migrate": "prisma migrate dev"`、`"db:seed": "tsx prisma/seed.ts"`、`"setup": "npm install && prisma migrate deploy && prisma db seed"`、顶层 `"prisma": { "seed": "tsx prisma/seed.ts" }`
  - seed 后的演示数据（README 会引用）：管理员 1 + 学生 4（2 已认证 / 2 未认证且各 1 条 PENDING 认证申请）、≥30 件商品（覆盖 8 分类与全部状态）、3 个会话（含未读消息）、2 件已成交商品与双向评价、2 条 PENDING 举报、若干收藏与浏览数

- [ ] **Step 1: package.json 补 scripts**

```json
"scripts": {
  "dev": "cross-env NODE_ENV=development tsx watch server.ts",
  "build": "next build",
  "start": "cross-env NODE_ENV=production tsx server.ts",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:migrate": "prisma migrate dev",
  "db:seed": "tsx prisma/seed.ts",
  "setup": "npm install && prisma migrate deploy && prisma db seed"
},
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 2: 写失败的测试**

`tests/seed/seed.test.ts`：

```ts
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
  }, 180_000)
})
```

- [ ] **Step 3: 实现 src/lib/seed-assets.ts**

```ts
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { Category } from '@/lib/constants'

const PALETTES: Record<Category, [string, string]> = {
  BOOKS: ['#dcefe7', '#9fd8c4'],
  DIGITAL: ['#dbe7f7', '#8fb4e8'],
  TRANSPORT: ['#fdeedd', '#f6c48b'],
  DORM: ['#e7e2f7', '#b3a3e8'],
  SPORTS: ['#dff2e2', '#94d3a4'],
  INSTRUMENTS: ['#f7e3ea', '#e3a0b8'],
  CLOTHING: ['#fde5e0', '#f2a898'],
  OTHER: ['#e8edf3', '#b8c2ce'],
}

/** 确定性伪随机（mulberry32）：同 seed 同图，seed 可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function generateItemImage(
  category: Category,
  seed: number,
  outDir: string,
): Promise<{ url: string; width: number; height: number }> {
  await mkdir(outDir, { recursive: true })
  const random = mulberry32(seed * 7919)
  const [light, dark] = PALETTES[category]
  const width = 800
  const height = [600, 800, 1000][seed % 3]
  const shapes: string[] = []
  for (let i = 0; i < 5; i += 1) {
    const cx = Math.round(random() * width)
    const cy = Math.round(random() * height)
    const r = Math.round(60 + random() * 160)
    const opacity = (0.12 + random() * 0.18).toFixed(2)
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}" opacity="${opacity}" />`)
  }
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${light}" />
    ${shapes.join('')}
    <rect x="0" y="${height - 18}" width="${width}" height="18" fill="${dark}" opacity="0.35" />
  </svg>`
  const fileName = `${category.toLowerCase()}-${seed}.webp`
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(path.join(outDir, fileName))
  return { url: `/uploads/seed/${fileName}`, width, height }
}

export async function generateAvatar(name: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true })
  let hash = 0
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const random = mulberry32(hash)
  const palette = Object.values(PALETTES)[hash % 8]
  const [light, dark] = palette
  const cells: string[] = []
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (random() > 0.5) {
        cells.push(`<rect x="${x * 16}" y="${y * 16}" width="16" height="16" fill="${dark}" />`)
        cells.push(`<rect x="${(4 - x) * 16}" y="${y * 16}" width="16" height="16" fill="${dark}" />`)
      }
    }
  }
  const svg = `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="${light}" />${cells.join('')}</svg>`
  const fileName = `avatar-${hash.toString(36)}.webp`
  await sharp(Buffer.from(svg)).webp().toFile(path.join(outDir, fileName))
  return `/uploads/seed/${fileName}`
}
```

- [ ] **Step 4: 实现 prisma/seed.ts**

```ts
// 演示数据脚本：幂等（每次先清空再重建），全部图片本地生成，不需要联网
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { generateAvatar, generateItemImage } from '../src/lib/seed-assets'
import { prisma } from '../src/lib/db'
import type { Category, Condition, ItemStatus } from '../src/lib/constants'

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
  { title: '捷安特 ATX 660 通勤山地车', priceYuan: 260, category: 'TRANSPORT', condition: 'LIKE_NEW_80', location: '西区车棚', negotiable: true, seller: 2 },
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
  { title: '得力 A4 打印纸 500张×5包', priceYuan: 40, category: 'OTHER', condition: 'NEW', location: '北区宿舍', negotiable: false, seller: 4 },
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
  const users = []
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

  const items = []
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
```


- [ ] **Step 5: 运行测试 + 提交**

```bash
npm test
npm run db:seed   # 给开发库灌演示数据（重复跑也安全）
git add -A
git commit -m "feat: seed 演示数据（本地生成图片/头像，幂等，覆盖全状态）"
```

---

### Task 27: README（含国内镜像说明）

**Files:**
- Modify: `README.md`（全量替换脚手架默认内容）

**Interfaces:**
- Consumes: 全部已完成功能
- Produces: 面向评审者的完整说明文档

- [ ] **Step 1: 写 README**

按以下结构写（内容用真实信息，不要占位符）：

````markdown
# 校园集市 · 大学校园二手交易平台

面向大学校园的二手交易平台：发布闲置、瀑布流淘货、站内实时聊天、线下当面交易、互评积累信誉、管理员治理。

> 作品集项目：无 CDN / 无外部字体 / 无外部 API —— 在无 VPN 环境下 clone 即可完整运行。

## 功能一览
- 商品：多图发布、瀑布流首页（服务端占位零抖动）、分类/搜索/排序、状态机（在售→已预订→已售出/下架）
- 实时聊天：Socket.IO 同进程、乐观发送、已读回执、正在输入、未读红点、图片消息、断线增量
- 社交：收藏、浏览历史、公开留言、成交互评与信誉分
- 认证与治理：模拟学生认证（上传→管理员审核→徽章）、举报、管理后台（仪表盘/审核/商品/用户/举报）
- 安全：bcrypt+Session 哈希、HttpOnly Cookie、写操作同源校验、上传双重校验、防枚举登录

## 快速开始（无 VPN 环境同样适用）

```bash
npm run setup   # 安装依赖 + 初始化数据库 + 灌入演示数据
npm run dev     # 启动（Next.js + Socket.IO 同一进程）
# 打开 http://localhost:3000
```

国内网络加速（可选）：`npm install --registry=https://registry.npmmirror.com`；若 Prisma 引擎下载缓慢，`set PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` 后重试 `npx prisma migrate deploy`（Git Bash 用 `export` 写法）。

## 演示账号（密码统一 `demo1234`）
| 账号 | 角色 | 说明 |
|---|---|---|
| admin@campus.dev | 管理员 | 可进 `/admin` 后台 |
| xiaolu@campus.dev | 已认证学生 | 有在售商品、收藏、会话 |
| azhe@campus.dev | 已认证学生 | 有在售商品与被举报记录 |
| taozi@campus.dev / doudou@campus.dev | 未认证 | 各有一条待审核认证申请 |

**双窗口聊天演示**：普通窗口登录 `xiaolu`、隐身窗口登录 `azhe`，从商品页互相「聊一聊」即可看到实时消息、已读与正在输入。

## 技术栈
Next.js（App Router，RSC + Route Handlers）· TypeScript strict · Tailwind CSS v4 · Prisma + SQLite（可切 PostgreSQL）· Socket.IO · sharp · zod · Vitest

## 架构要点
（粘贴 Spec §5.1 架构图与「一条消息的旅程」7 步）

## 常用命令
| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发（tsx watch 自定义服务器） |
| `npm run build && npm start` | 生产构建与启动 |
| `npm test` | Vitest 单元 + 集成 + 实时层测试 |
| `npm run db:migrate` / `npm run db:seed` | 迁移 / 重置演示数据 |

## 部署
任意 Node ≥ 20 主机（Railway / Render / VPS）：`npm ci && npm run build && npm start`；切 PostgreSQL 只需改 `prisma/schema.prisma` 的 `provider` 与 `DATABASE_URL`；上传目录挂载卷或替换 `src/lib/storage.ts` 的实现。

## 目录结构 / 未来规划
（目录结构粘贴 Spec 附录；未来规划粘贴 Spec §9：OSS 存储、PG 全文搜索、Web Push、举报风控、多校区）

## 设计与实现文档
- 设计文档：`docs/superpowers/specs/2026-10-16-campus-market-design.md`
- 实现计划：`docs/superpowers/plans/2026-10-16-campus-market.md`
````

- [ ] **Step 2: 提交**

```bash
git add -A
git commit -m "docs: README（快速开始/演示账号/无 VPN 说明/镜像加速/部署）"
```

---

### Task 28: 验收清单 + 视觉打磨

**Files:**
- Create: `src/app/icon.svg`（站点图标：品牌色几何标记，本地 SVG）
- Modify: 首页 `src/app/page.tsx` 等按验收发现的问题修正
- Modify: `README.md`（末尾追加「验收记录」小节）

**Interfaces:**
- Consumes: 全部
- Produces: 可交付状态 + 验收记录

- [ ] **Step 1: 站点图标与元信息**

`src/app/icon.svg`（Next.js 会自动作为 favicon 使用，零外部依赖）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0FA47F"/>
  <path d="M20 40l10-20 6 12 8-8-4 16z" fill="#ffffff"/>
  <circle cx="22" cy="44" r="3" fill="#FF5A3C"/>
</svg>
```

- [ ] **Step 2: 跑通自动化验收项**

```bash
npm test                                   # 1. 全部测试通过
npm run setup                              # 2. 一键安装+迁移+seed（验证 setup 脚本）
npm run dev > dev.log 2>&1 & echo $! > dev.pid
sleep 15
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000 | grep -o "同学们正在出闲置" | head -1   # 3. 首页直出
curl -s "http://localhost:3000/socket.io/?EIO=4&transport=polling" | head -c 20                                    # 4. Socket.IO 握手
curl -s --retry 5 --retry-delay 3 --retry-all-errors http://localhost:3000/api/items | head -c 120                  # 5. 列表 API 返回数据
taskkill //F //T //PID $(cat dev.pid) 2>/dev/null; rm -f dev.pid
```

- [ ] **Step 3: 人工验收（在浏览器里逐项走查）**

1. 普通 + 隐身双窗口登录 `xiaolu` / `azhe`：从商品页「聊一聊」→ 互发消息（实时到达）→ 看「已读 / 正在输入 / 未读红点」
2. 发布一件新商品（多图上传）→ 首页瀑布流可见且滚动无抖动 → 详情页收藏 → 编辑 → 下架 → 重新上架
3. 第二个账号聊出新会话 → 卖家「我的发布」标记已售（从会话选买家）→ 双方互评 → 信誉分更新
4. 提交学生认证 → `admin` 账号进 `/admin` 审核通过 → 徽章出现；封禁 `doudou` 后用其账号验证无法登录
5. 举报一个商品 → admin 后台举报队列受理

- [ ] **Step 4: 无外部请求检查（无 VPN 硬性约束）**

浏览器 DevTools Console 运行：

```js
performance.getEntriesByType('resource').map(r => r.name).filter(u => !u.startsWith(location.origin))
```

预期：输出 `[]`（除 localhost 外零请求）。同时 Network 面板确认无字体/CDN/分析脚本请求。

- [ ] **Step 5: 修复走查中发现的问题，记录验收结果**

在 README 末尾追加：

```markdown
## 验收记录（2026-10-16）

- [x] npm run setup / npm run dev 一键跑起
- [x] Vitest 全部通过（单元 + 集成 + 实时层）
- [x] 双窗口实时聊天：消息 / 未读 / 已读 / 正在输入 全部通过
- [x] 完整闭环：注册→认证→发布→浏览→聊天→成交→互评→后台治理
- [x] 后台五个板块可用、仪表盘有数据
- [x] DevTools 确认零外部请求（无 VPN 可用）
- 备注：（记录发现并修复的问题）
```

- [ ] **Step 6: 最终提交**

```bash
npm test
git add -A
git commit -m "chore: 验收通过 —— 站点图标、README 验收记录、走查修复"
```

---

## 完成标准（Definition of Done）

全部 28 个 Task 勾选完毕，且：

1. `npm run setup && npm run dev` 在无 VPN 环境一键跑起（含演示数据）
2. `npm test` 全绿（单元 + 集成 + Socket.IO 实时层）
3. Spec §10 验收清单全部勾选并记录在 README
4. git 历史为逐任务的规范提交（`feat:/fix:/test:/docs:/chore:`）


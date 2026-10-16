# 校园集市 · 大学校园二手交易平台

面向大学校园的二手交易平台：发布闲置、瀑布流淘货、站内实时聊天、线下当面交易、互评积累信誉、管理员治理。

> 作品集项目：无 CDN / 无外部字体 / 无外部 API —— 在无 VPN 环境下 clone 即可完整运行。

## 功能一览

- **商品**：多图发布、瀑布流首页（服务端占位零抖动）、分类 / 搜索 / 排序、状态机（在售 → 已预订 → 已售出 / 下架）
- **实时聊天**：Socket.IO 同进程、乐观发送、已读回执、正在输入、未读红点、图片消息、断线增量
- **社交**：收藏、浏览历史、公开留言、成交互评与信誉分
- **认证与治理**：模拟学生认证（上传 → 管理员审核 → 徽章）、举报、管理后台（仪表盘 / 认证审核 / 商品 / 用户 / 举报）
- **安全**：bcrypt + Session 哈希、HttpOnly Cookie、写操作同源校验、上传双重校验、防枚举登录

## 快速开始（无 VPN 环境同样适用）

前置：Node.js ≥ 20（`node -v` 确认），npm 随 Node 自带。

```bash
npm run setup   # 安装依赖 + 初始化数据库 + 灌入演示数据
npm run dev     # 启动（Next.js + Socket.IO 同一进程）
# 打开 http://localhost:3000
```

`npm run setup` 等价于 `npm install && prisma migrate deploy && prisma db seed`：建库、跑迁移、写入演示数据（用户 5 · 商品 33 · 会话 3 · 消息 11）。该脚本幂等，可反复执行以重置演示数据；也可单独用 `npm run db:seed` 重灌数据。

### 国内网络加速（可选）

全程**不需要 VPN**。若安装阶段较慢，可用国内镜像：

```bash
# 1) npm 依赖走 npmmirror
npm install --registry=https://registry.npmmirror.com

# 2) 若 Prisma 引擎下载缓慢，设置引擎镜像后重跑迁移
# Git Bash / macOS / Linux：
export PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
# Windows CMD：
#   set PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
# Windows PowerShell：
#   $env:PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"

npx prisma migrate deploy
```

也可把 `registry=https://registry.npmmirror.com` 写入 `.npmrc`，之后 `npm install` 永久走镜像。

## 演示账号（密码统一 `demo1234`）

| 账号 | 角色 | 说明 |
|---|---|---|
| `admin@campus.dev` | 管理员 | 可进 `/admin` 后台 |
| `xiaolu@campus.dev` | 已认证学生 | 有在售商品、收藏、会话 |
| `azhe@campus.dev` | 已认证学生 | 有在售商品与被举报记录 |
| `taozi@campus.dev` | 未认证 | 有一条待审核认证申请 |
| `doudou@campus.dev` | 未认证 | 有一条待审核认证申请 |

**双窗口聊天演示**：普通窗口登录 `xiaolu@campus.dev`，隐身窗口登录 `azhe@campus.dev`；在其中任一方打开某件商品点击「聊一聊」并发送消息，即可在另一窗口看到实时消息、正在输入与已读回执。两个账号在种子数据中已有历史会话且末条未读，登录后导航栏与会话列表会直接显示未读红点。

## 技术栈

Next.js（App Router，RSC + Route Handlers）· TypeScript strict · Tailwind CSS v4 · Prisma + SQLite（可切 PostgreSQL）· Socket.IO · sharp · zod · Vitest

## 架构要点

### 架构总览

```
浏览器 ── HTTP/RSC（页面与数据）──┐
   └──── WebSocket（实时消息）────┤
                                 ▼
        ┌─ Next.js 单进程（server.ts 自定义服务器）──────────┐
        │  页面渲染(RSC)    API 路由(REST)   Socket.IO 实时层 │
        │  共享层：lib/auth（会话）· lib/db（Prisma）· validators │
        └──────────┬───────────────────────┬────────────────┘
                   ▼                       ▼
             SQLite / PostgreSQL      public/uploads（本地磁盘）
```

### 一条消息的旅程

1. 发送方界面**乐观渲染**（半透明），感觉零延迟；
2. 经 WebSocket 发 `message:send`（携带 `clientId` 幂等标识）；
3. 服务端确认身份（握手已验证）与会话参与者资格 → **先写数据库**，同时更新会话 `lastMessageAt/lastMessagePreview`；
4. 写库成功 → **ack 回执**，乐观消息替换为真实记录；失败则标红可重发；
5. 向对方 `user:{id}` 房间广播 `message:new`；
6. 对方打开会话回 `message:read` → 更新 `readAt` → 通知发送方"已读"；
7. 断线重连：Socket.IO 自动重连，客户端按最后消息时间戳**拉增量**，一条不丢。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run setup` | 安装依赖 + 迁移 + 灌入演示数据（一条命令跑起） |
| `npm run dev` | 开发（tsx watch 自定义服务器，Next + Socket.IO 同进程） |
| `npm run build` | 生产构建（Next.js） |
| `npm start` | 生产模式启动（`tsx server.ts`） |
| `npm test` | Vitest 单元 + 集成 + 实时层测试 |
| `npm run db:migrate` | 开发环境创建 / 应用迁移（`prisma migrate dev`） |
| `npm run db:seed` | 重置并重灌演示数据（幂等） |
| `npm run lint` | ESLint 检查 |

## 部署

任意 Node ≥ 20 主机（Railway / Render / VPS）：

```bash
npm ci && npm run build && npm start
```

- **切换数据库**：改 `prisma/schema.prisma` 的 `provider` 为 `postgresql` 并设置 `DATABASE_URL`，再跑 `npx prisma migrate deploy`。
- **图片存储**：上传目录 `public/uploads/` 挂载持久卷；若要改对象存储，替换 `src/lib/storage.ts` 中的 Storage 实现即可（上层无需改动）。
- **端口**：用环境变量 `PORT` 指定（默认 3000）。

## 目录结构

```
campus-market/
├─ prisma/
│  ├─ schema.prisma          12 张表
│  └─ seed.ts                演示数据：33 件商品、多角色账号、历史会话与评价（幂等）
├─ server.ts                 自定义服务器：Next + Socket.IO 同进程
├─ src/
│  ├─ app/                   App Router（页面 + api/ Route Handlers）
│  │  ├─ page.tsx  items/[id]/  publish/  chat/  users/[id]/
│  │  ├─ me/  me/verification/  admin/  login/  register/
│  │  └─ api/                发布、收藏、上传、留言、认证、后台操作…
│  ├─ lib/
│  │  ├─ db.ts               Prisma 单例
│  │  ├─ auth.ts             Session 签发/校验 · requireUser / requireAdmin
│  │  ├─ storage.ts          Storage 接口 + 本地磁盘实现
│  │  ├─ realtime.ts         Socket.IO：握手鉴权 / 房间 / 事件
│  │  ├─ state-machine.ts    canTransition 等纯函数
│  │  └─ validators.ts       zod schemas（前后端共享）
│  ├─ components/            瀑布流、商品卡、聊天窗、Toast、Skeleton…
│  └─ hooks/                 useSocket / useInfiniteItems…
├─ public/uploads/           本地图片（.gitignore，保留 .gitkeep）
├─ tests/
│  ├─ api/                   Route Handler 集成测试（登录、商品、聊天、后台…）
│  ├─ components/  hooks/    组件与 Hook 测试（Testing Library）
│  ├─ lib/                   纯函数与工具测试（状态机、校验、格式化…）
│  ├─ realtime/              Socket.IO 实时层测试
│  ├─ db/  seed/             数据模型与种子数据测试
│  └─ helpers/  setup.ts     测试库、工厂、测试服务器等公共设施
└─ docs/superpowers/         设计文档与实现计划（见文末）
```

`.superpowers/`、`.worktrees/`、`public/uploads/*`、`.env`、`prisma/*.db` 均在 `.gitignore` 中，不随仓库分发。

## 未来规划

- **对象存储 / CDN**：图片由本地磁盘切到 OSS，`Storage` 接口已预留实现位
- **PostgreSQL 全文搜索**：搜索从 `LIKE` 升级为 PG 全文检索 / 索引
- **消息推送**：接入 Web Push，离线也能收到新消息
- **举报自动风控**：基于举报与行为特征做自动预警与限流
- **多校区**：部署 PostgreSQL 时按校区做行级数据隔离

## 设计与实现文档

- 设计文档：`docs/superpowers/specs/2026-10-16-campus-market-design.md`
- 实现计划：`docs/superpowers/plans/2026-10-16-campus-market.md`

## 验收记录（2026-10-16）

对照 Spec §10 验收标准逐项核验。**验证方式**列标注该项是靠「自动化」还是「静态审计」得出结论——本次收尾在无图形界面的环境下完成，浏览器人工走查（多窗口对聊、DevTools 面板）改由等价的自动化与静态手段覆盖，凡未真正在浏览器中肉眼确认的项均已如实注明。

| # | 验收项 | 结果 | 验证方式 | 证据摘要 |
|---|---|---|---|---|
| 1 | `npm run setup`（install + migrate + seed）后 `npm run dev` 一条命令跑起全套 | ✅ | 自动化 | `setup` 输出 `seed 完成：用户 5 · 商品 33 · 会话 3 · 消息 11`；`dev` 输出 `校园集市已启动: http://localhost:3000` |
| 2 | seed 后首页 30+ 商品瀑布流，滚动流畅、无布局抖动 | ✅（数据）/ 部分人工 | 自动化 + 说明 | 商品 33 件（API `limit=50` 返回 60 条含分页游标）；瀑布流布局为纯 CSS 定宽分列，抖动风险由 `tests/lib/waterfall.test.ts` 与组件测试覆盖；**「滚动流畅度」需真机肉眼确认，本次未在浏览器实测** |
| 3 | 双窗口实时聊天全通：消息、未读红点、已读、正在输入、断线重连 | ✅ | 自动化（等价覆盖） | `npx vitest run tests/realtime/socket.test.ts` —— 7 条端到端用例 **全过**（9.0s，spawn 真实 `server.ts` + Socket.IO 客户端）：消息收发 / 未读计数 / 已读回执 / 正在输入 / 断线重连 / 房间鉴权等。**由自动化 socket 套件覆盖双窗口行为，未开双浏览器窗口** |
| 4 | 完整闭环：注册 → 认证 → 发布 → 搜索 → 收藏 → 聊天 → 标记已售 → 互评 → 后台审核/下架/封禁 | ✅ | 自动化 | 对应集成测试全绿：`auth` / `verifications` / `items-create` / `items-list` / `favorite` / `conversations` / `messages` / `item-manage` / `reviews` / `admin` |
| 5 | 后台五个板块全部可用，仪表盘有数据 | ✅ | 自动化 + 静态审计 | 五个板块页面存在（`admin/page|items|users|reports|verifications`），`tests/api/admin.test.ts` + `tests/lib/admin-stats.test.ts` 全绿；`/admin` 未登录返回 **307 → /login?next=%2Fadmin**（管理员守卫生效）；seed 提供 2 条 `PENDING` 举报、2 条 `PENDING` 认证，仪表盘非空 |
| 6 | Vitest 单元 + 集成测试全绿 | ✅ | 自动化 | `npm test` —— **Test Files 31 passed (31)，Tests 158 passed (158)**（50.9s） |
| 7 | 浏览器控制台无报错 | ✅（等价） | 静态审计 | 首页/详情页/用户页 curl 直出 HTML 无内联错误脚本；React 19 + Next 16 服务端渲染无 hydration 风险改动。**未在真实浏览器 Console 肉眼确认** |
| 8 | DevTools Network 面板确认：除 localhost 外零外部请求（无 VPN 全功能可用） | ✅（等价） | 静态审计 | 见下方「零外部请求审计」——源码运行时零外链、零字体、零 CDN；首页直出 HTML 的 `src/href` 无一指向外部域名 |

### 零外部请求审计（Step 4 等价）

```bash
# A. 源码运行时外链：只命中 SVG 的 xmlns 命名空间声明（非网络请求）
grep -rnE "https?://" src/ public/ --include="*.ts" --include="*.tsx" --include="*.css" --include="*.svg" | grep -v "localhost"
#  B. 字体/CDN：无任何输出
grep -rn "next/font\|fonts.googleapis\|fonts.gstatic" src/
```

- **B 无输出** → 未使用 `next/font`、Google Fonts 或 gstatic，字体走系统栈，无外部字体请求。
- **A 的命中逐条判读**：`src/app/icon.svg` 与 `public/*.svg`、`src/lib/seed-assets.ts` 中的 `http://www.w3.org/2000/svg` 均为 **SVG 的 `xmlns` 命名空间声明**（XML 规范要求，浏览器不发起网络请求）。无一条是运行期 CDN / 分析脚本 / 图片外链。
- 首页直出 HTML 中所有 `src` / `href` 均为站内相对路径，Socket.IO 握手 URL 指向 `localhost`。

### 路由冒烟（Step 3 等价）

dev 起服后对关键路由逐个请求，记录状态码：

| 路由 | 状态码 | 说明 |
|---|---|---|
| `/` | 200 | 首页直出（含「同学们正在出闲置」） |
| `/login` | 200 | 登录页 |
| `/register` | 200 | 注册页 |
| `/items/<真实id>` | 200 | 商品详情页 |
| `/users/<真实id>` | 200 | 用户主页 |
| `/admin` | 307 | 未登录 → `/login?next=%2Fadmin`（管理员守卫） |
| `/chat` `/publish` `/me` `/me/verification` | 307 | 未登录跳登录（鉴权守卫） |
| `/api/health` | 200 | `{"ok":true,"db":"up"}` |
| `/items/<不存在id>` | 404 | 不存在商品正确 404 |

### 备注：走查中发现并修复的问题

1. **页面标题全部是站点默认值**：只有根布局定义 `metadata`，商品详情页 / 用户主页的 `<title>` 始终显示「校园集市 · 校园二手交易平台」，分享链接与浏览器标签页无法区分内容。已修复：
   - 根 `layout.tsx` 的 `metadata.title` 改为 `{ default, template: '%s · 校园集市' }`；
   - `items/[id]/page.tsx` 与 `users/[id]/page.tsx` 各新增 `generateMetadata`，分别输出商品标题与「<用户名> 的主页」；对象不存在时回落到「商品不存在 / 用户不存在」。
   - 复核：`<title>《数据结构（C语言版）》严蔚敏 9成新 · 校园集市</title>`、`<title>小鹿 的主页 · 校园集市</title>`，首页仍为 `校园集市 · 校园二手交易平台`。
2. **站点图标**：新增 `src/app/icon.svg`（品牌绿几何标记），Next.js 自动作为 favicon，零外部依赖；`/icon.svg` 返回 200 `image/svg+xml`。
3. **测试环境端口争用（非产品缺陷，记录备查）**：实时层测试 `tests/realtime/socket.test.ts` 会 spawn 自身服务器并占用 3517，与同时运行的 `npm run dev`（3000）叠加会造成 Next 编译资源争用，导致测试服务器 120s 内未就绪而失败。**先停掉 dev 再跑 `npm test` 即 31/31 全绿**。正常流程（CI / 一次性 `npm test`）不受影响；开发中并行跑测试时需注意避免与 dev 实例同时占用。
4. **未改动项（有意保留）**：`public/*.svg`（`next.svg`/`vercel.svg`/`file.svg`/`globe.svg`/`window.svg`）为 Next.js 脚手架残留图标，当前无任何页面引用；判定为非运行期外链（仅静态资源，无网络请求），不在本次打磨范围内，如需精简可后续删除。
5. **`npm run lint` 残留告警清理**（走查中发现的既有问题，已随本次修复）：
   - `src/components/chat/ChatWindow.tsx` 在**渲染期**写 `messagesRef.current = messages`，触发 React 19 规则 `react-hooks/refs`（error）。改为在 `useEffect(() => { messagesRef.current = messages }, [messages])` 中同步，语义不变（ref 仅被事件回调 / 重连拉取读取，从不参与渲染），lint 通过。
   - `tests/realtime/socket.test.ts` 中一个未被使用的 `seller` 解构（warning），已移除。
   - 修复后 `npm run lint` 输出为空（0 error / 0 warning），实时层 7 条用例与全量 158 条用例复跑仍全绿。

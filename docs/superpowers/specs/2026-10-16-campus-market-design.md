# 校园集市 · 大学校园二手交易平台 — 设计文档

- **日期**：2026-10-16
- **状态**：三段设计评审已通过；本文档待用户审阅，审阅通过后进入实现计划（writing-plans）
- **平台名**：校园集市（暂定，可改）；仓库名 `campus-market`

---

## 1. 项目概述

**一句话**：面向大学校园的二手交易平台——学生发布闲置、浏览淘货、站内实时沟通、线下当面交易、互评积累信誉、管理员治理社区。

**定位**：个人作品集项目。重点是**代码质量、设计观感、技术亮点**，而非真实运维规模。

**成功标准（作品集视角）**
- clone 后一条命令本地跑起（含演示数据），评审者零配置体验
- 可完整演示闭环：注册 → 学生认证 → 发布 → 浏览搜索 → 实时聊天 → 成交流转 → 互评 → 后台治理
- 两个浏览器窗口可现场演示实时聊天（消息 / 已读 / 正在输入 / 未读红点）
- 视觉有辨识度（"清新活力"风格 + 瀑布流首页），一眼不像模板
- 有讲得出的工程故事：单进程双通道、服务端占位瀑布流、整数分价格、防刷评价、手写 Session

**seed 演示账号**（README 明示，密码统一 `demo1234`）：管理员 1 个、已验证学生 2 个、未验证学生 1 个，30+ 预置商品、若干历史会话与评价、2 条待审核认证。

---

## 2. 技术选型

| 层次 | 选择 | 理由 |
|---|---|---|
| 框架 | Next.js 最新稳定版（App Router）+ TypeScript strict | 主流全栈方案，RSC 直连数据库，招聘市场认可度高 |
| 服务器 | 自定义 `server.ts`（开发用 `tsx watch`，保留热更新） | Socket.IO 与 Next 同进程，共享鉴权与数据层 |
| 实时 | Socket.IO | 房间、ack 回执、断线重连开箱即用 |
| ORM / 数据库 | Prisma + SQLite（开发）→ PostgreSQL（部署可切） | 本地零配置；改 `DATABASE_URL` 与 provider 即切换 |
| 认证 | 手写 Session：bcrypt + httpOnly Cookie + Session 表 | 透明可控，与 Socket.IO 握手天然打通；面试可讲透 |
| 输入校验 | zod（schema 前后端共享） | 一处定义、两端复用 |
| 图片 | sharp：校验真图 + 转 WebP + 读宽高 | 不信任客户端声明；宽高供瀑布流占位 |
| 样式 | Tailwind CSS v4 + 自定义设计 token | 主流、便于落实设计系统（见 §6） |
| 测试 | Vitest（单元 + 基于独立测试库的 API 集成） | 轻、快、TS 原生 |
| 包管理 | npm；Node ≥ 20 | 零额外工具链 |

版本策略：以安装当天 create-next-app 的稳定版本为准，不锁定小版本号。

**网络环境约束（硬性要求）**：最终成果必须在**无 VPN 的国内网络环境（或完全离线）**下用浏览器打开、运行、交互——零 CDN、零 Google Fonts、零外部 API 调用、零第三方统计脚本。字体用系统栈（§6）、图标用内联 SVG（不用图标字体 / 外部图标库）、图片与头像全部本地生成与存储（seed 占位图由 sharp 本地生成，不下载）。README 附国内镜像加速说明（npm registry、Prisma engines mirror），保证安装阶段也不依赖 VPN。

---

## 3. 功能规格

### 3.1 用户与认证

- **注册**：邮箱 + 昵称 + 密码（≥ 8 位）。昵称与邮箱均唯一，冲突时给字段级错误。注册成功即登录。
- **登录 / 登出**：登录失败统一提示"邮箱或密码错误"（防枚举）。Session 有效期 30 天；登出销毁该条 Session。
- **学生认证**：提交学号（文本）+ 学生证照片 → `PENDING`；管理员审核 → `APPROVED`（写 `User.verifiedAt`）或 `REJECTED`（驳回理由必填）。驳回后可重新提交；已是认证状态不可再提交。认证徽章在商品卡、详情页、用户主页、聊天窗全站可见。
- **封禁**：`BANNED` 用户无法登录；已有 Session 在校验时立即失效；在线 Socket 连接被断开。

### 3.2 商品

- **发布**（登录即发，不要求认证）：1–9 张图（先走上传接口拿 `{url,width,height}` 再提交）、标题 4–60 字、描述 10–2000 字、价格 0.01–99999.00 元（存分）、"可小刀"标记、分类（教材 / 数码 / 代步 / 宿舍电器 / 运动 / 乐器 / 服饰 / 其他）、成色（全新 / 99新 / 9成新 / 8成新 / 7成新及以下）、交易地点 2–40 字。
- **状态机**（详见 §5.7）：`ON_SALE ⇄ RESERVED → SOLD（终态）`，随时可 `DELISTED`；全部由卖家操作。管理员下架商品 `delistedBy=ADMIN`，卖家不能重新上架。
- **列表**：瀑布流首页；`?category=` 筛选、`?q=` 搜索（标题 + 描述 LIKE）、`?sort=latest|price_asc|price_desc`；游标分页 + 无限滚动。
- **详情**：图片轮播、卖家卡（认证徽章 / 信誉分 / 成交数）、收藏、聊一聊、公开留言区、举报入口；每次访问 `viewCount+1`。
- **编辑**：在售 / 已预订状态可编辑文本与图片（不换卖家）；不做删除，用下架代替。
- **我的发布**：列表含状态操作（预订 / 取消预订 / 下架 / 重新上架 / 标记已售）；标记已售需从该商品的会话中选择买家。

### 3.3 聊天

- **会话**：`(itemId, buyerId)` 唯一；不能与自己发起会话；商品售出后会话保留可继续沟通。
- **消息**：文本 1–2000 字，或图片（单张 ≤5MB，走统一上传管线）；历史消息倒序游标分页加载。
- **实时**（详见 §5.2）：新消息即时到达、未读红点（导航栏 + 会话列表）、已读回执、"正在输入"提示（客户端节流 2s，不落库）。
- **会话列表**：按 `lastMessageAt` 倒序，显示最后一条预览与未读数。

### 3.4 社交与信誉

- **收藏**（想要清单）：幂等切换；`Item.favoriteCount` 在事务中维护。
- **浏览历史**：登录用户访问商品详情时 upsert `viewedAt`（不阻塞渲染）；个人中心展示最近 50 条。
- **公开留言**：1–500 字，扁平结构（不做楼中楼）。
- **评价**：成交（`SOLD`）后买卖双方互评，`rating` 1–5 星必填 + 文字 ≤200 字（可选）；`unique(itemId, authorId)` 每人每单一次；写入时事务更新对方 `ratingAvg / ratingCount`；不可修改删除。
- **信誉展示**：`ratingAvg`（1 位小数）+ `ratingCount` + `soldCount`；无评价显示"暂无评价"。
- **举报**：商品 / 用户，理由 5–500 字；同一人 24 小时内对同一目标不重复举报（应用层校验）。

### 3.5 管理后台（`/admin/*`，requireAdmin）

- **仪表盘**：用户数 / 在售商品数 / 消息数 / 待审核认证数 / 待处理举报数；近 7 天新增商品与用户的迷你柱状图（纯 CSS 实现，零图表依赖）。
- **认证审核队列**：通过 / 驳回（理由必填）。
- **商品管理**：搜索 → 查看 → 下架（`delistedBy=ADMIN`）。
- **用户管理**：搜索 → 封禁 / 解封。
- **举报处理队列**：查看 → 标记 `RESOLVED` / `DISMISSED`，可一键跳转到被举报目标。

### 3.6 页面与路由

| 路由 | 页面 | 访问要求 |
|---|---|---|
| `/` | 首页瀑布流（分类 / 搜索 / 排序） | 公开 |
| `/items/[id]` | 商品详情 | 公开 |
| `/publish` | 发布商品 | 登录 |
| `/chat` · `/chat/[id]` | 会话列表 · 聊天窗 | 登录 |
| `/users/[id]` | 用户主页（在售 / 已售 / 评价 / 徽章） | 公开 |
| `/me` | 个人中心（我的发布 / 收藏 / 历史 / 认证入口） | 登录 |
| `/me/verification` | 学生认证提交 | 登录 |
| `/admin` · `/admin/*` | 后台五个板块 | 管理员 |
| `/login` · `/register` | 登录 / 注册 | 公开（已登录跳转） |

---

## 4. 数据模型（Prisma，12 张表）

> 枚举一律用 `String` + TS 联合类型（不用 Prisma enum），保证 SQLite 开发与 PostgreSQL 部署双兼容。金额一律整数"分"。所有表含 `id String @id @default(cuid())`。

### User（用户）
`username`(unique) · `email`(unique) · `passwordHash` · `avatarUrl` · `role: USER|ADMIN` · `status: ACTIVE|BANNED` · `campus`(校区) · `verifiedAt?`（null=未认证）· `ratingAvg Float @default(0)` · `ratingCount Int @default(0)` · `soldCount Int @default(0)` · `createdAt`

### Session（登录会话）
`userId → User` · `tokenHash`(unique，SHA-256) · `expiresAt` · `createdAt`

### VerificationRequest（认证申请）
`userId → User` · `studentNo` · `proofImageUrl` · `status: PENDING|APPROVED|REJECTED` · `rejectReason?` · `createdAt` · `reviewedAt?`

### Item（商品）
`title` · `description` · `priceCents Int` · `negotiable Bool` · `category` · `condition` · `location` · `status: ON_SALE|RESERVED|SOLD|DELISTED` · `delistedBy?: USER|ADMIN` · `sellerId → User` · `buyerId? → User`（成交买家）· `viewCount Int` · `favoriteCount Int` · `createdAt` · `updatedAt` · `soldAt?`

### ItemImage（商品图片）
`itemId → Item` · `url` · `width Int` · `height Int` · `sort Int`

### Conversation（会话）
`itemId → Item` · `buyerId / sellerId → User` · `lastMessageAt` · `lastMessagePreview` · `createdAt` · **`unique(itemId, buyerId)`**

### Message（消息）
`conversationId → Conversation` · `senderId → User` · `type: TEXT|IMAGE` · `content`（文本或图片 URL）· `readAt?`（对方已读时间）· `createdAt`

### Favorite（收藏）
`userId` · `itemId` · `createdAt` · **`unique(userId, itemId)`**

### ViewHistory（浏览历史）
`userId` · `itemId` · `viewedAt` · **`unique(userId, itemId)`**

### Comment（公开留言）
`itemId` · `authorId → User` · `content` · `createdAt`

### Review（评价）
`itemId → Item` · `authorId → User`（评价人）· `targetId → User`（被评人）· `rating Int (1–5)` · `content?`（≤200 字）· `createdAt` · **`unique(itemId, authorId)`**

### Report（举报）
`reporterId → User` · `targetType: ITEM|USER` · `targetId` · `reason` · `status: PENDING|RESOLVED|DISMISSED` · `createdAt` · `handledAt?`

### 关键设计决策

1. **金额用整数「分」**（`priceCents`）：从根上杜绝浮点误差；展示层统一格式化。
2. **图片入库宽高像素**：瀑布流由服务端算好占位比例 → 零布局抖动、零第三方瀑布流库。
3. **刻意冗余的计数器**（`User.ratingAvg/ratingCount/soldCount`、`Item.viewCount/favoriteCount`）：列表页不做聚合查询，避免 N+1；写路径在事务中维护。
4. **会话唯一约束** `(itemId, buyerId)` 防碎片；已读按单条消息记（`readAt`），未读数 = 对方未读条数。
5. **评价唯一约束** `(itemId, authorId)`：一个成交每人只能评一次，信誉分刷不动。
6. **Session 只存 token 的 SHA-256 哈希**：数据库泄露也无法冒用登录态。
7. **管理员下架与卖家下架可区分**（`delistedBy`）：违规下架不可被卖家复活。

---

## 5. 技术架构

### 5.1 架构总览

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

### 5.2 实时层设计

- **握手鉴权**：Socket.IO `io.use()` 中间件解析 Cookie → 复用 `lib/auth` 校验 Session → 挂 `socket.data.user`；失败拒绝连接。同源部署无 CORS 问题。
- **房间模型**：每个连接加入 `user:{id}`；打开会话时 `join conv:{id}`，离开时 leave。
- **事件表**：

| 方向 | 事件 | 载荷 | 说明 |
|---|---|---|---|
| C→S | `conversation:join` | `{conversationId}` | 校验参与者后加入会话房间 |
| C→S | `message:send` | `{conversationId, type, content, clientId}` | ack 返回 `{ok, message}` 或 `{ok:false, error}` |
| C→S | `message:read` | `{conversationId}` | 将该会话中对方未读消息全部置 `readAt` |
| C→S | `typing` | `{conversationId, isTyping}` | 不落库，转发给对方 |
| S→C | `message:new` | `{message}` | 推给 `user:{对方id}` 房间；未读红点 +1 |
| S→C | `conversation:new` | `{conversation}` | 新会话首条消息，对方会话列表实时出现 |
| S→C | `message:read` | `{conversationId, readAt}` | 已读回执展示 |
| S→C | `typing` | `{conversationId, userId, isTyping}` | 正在输入提示 |

- **一条消息的旅程**：
  1. 发送方界面**乐观渲染**（半透明），感觉零延迟；
  2. 经 WebSocket 发 `message:send`（携带 `clientId` 幂等标识）；
  3. 服务端确认身份（握手已验证）与会话参与者资格 → **先写数据库**，同时更新会话 `lastMessageAt/lastMessagePreview`；
  4. 写库成功 → **ack 回执**，乐观消息替换为真实记录；失败则标红可重发；
  5. 向对方 `user:{id}` 房间广播 `message:new`；
  6. 对方打开会话回 `message:read` → 更新 `readAt` → 通知发送方"已读"；
  7. 断线重连：Socket.IO 自动重连，客户端按最后消息时间戳**拉增量**，一条不丢。

### 5.3 鉴权设计

- **注册**：zod 校验 → bcrypt（cost 10）哈希 → 建用户 → 签发 Session。
- **登录**：查用户 → `bcrypt.compare` → 生成 32 字节随机 token（`crypto.randomBytes`）→ 库存 SHA-256 哈希 → `Set-Cookie: session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=30d`（生产加 `Secure`）。
- **服务端工具**：`requireUser()` / `requireAdmin()`，RSC 与 Route Handler 共用；校验时检查 `status=BANNED` 则销毁 Session 并拒绝。
- **CSRF**：`SameSite=Lax` 兜底 + 所有写操作（POST/PATCH/DELETE）校验 `Origin` 与站点同源。
- **Socket**：握手复用同一套校验，不另造轮子。

### 5.4 图片上传管线

`POST /api/upload`（multipart，登录可调）→ 大小 ≤5MB、MIME 白名单（jpeg/png/webp）→ **sharp 实际解码校验是真图**并转 WebP(q82) → 读宽高 → 存 `public/uploads/{yyyy}/{uuid}.webp` → 返回 `{url, width, height}`。经 `lib/storage.ts` 的 Storage 接口封装，未来切 OSS 只换实现类。

### 5.5 搜索与分页

- 搜索：`title` 与 `description` 的 `contains` 查询（SQLite 规模足够）；与分类、排序自由组合。
- 分页：游标 = 最后一条的 `(createdAt, id)`；`GET /api/items?cursor=&category=&q=&sort=`；首屏 RSC 渲染，滚动由客户端续拉。

### 5.6 错误处理

- API 统一返回 `{error: {code, message, fields?}}`；错误码：`UNAUTHENTICATED / FORBIDDEN / NOT_FOUND / VALIDATION / CONFLICT / INTERNAL`。
- zod 校验失败 → 400 + 字段级错误（`fields`），表单直接映射到对应输入框。
- 前端错误统一 Toast 呈现；Socket 事件错误经 ack 回传，不进全局错误流。

### 5.7 商品状态机

| 从 | 到 | 谁 | 附加动作 |
|---|---|---|---|
| ON_SALE | RESERVED | 卖家 | — |
| RESERVED | ON_SALE | 卖家 | 取消预订 |
| ON_SALE / RESERVED | SOLD | 卖家 | 必选买家（来自该商品会话）→ 写 `buyerId/soldAt`，双方 `soldCount+1`，开启互评 |
| ON_SALE / RESERVED | DELISTED | 卖家 | `delistedBy=USER`，可重新上架 |
| ON_SALE / RESERVED | DELISTED | 管理员 | `delistedBy=ADMIN`，卖家不可重新上架 |
| DELISTED（delistedBy=USER） | ON_SALE | 卖家 | 重新上架 |
| SOLD | — | — | 终态，不可逆 |

状态转换集中在一个纯函数 `canTransition(item, action, actor)` 中，单元测试重点覆盖。

---

## 6. 设计系统（视觉）

**风格：A · 清新活力**。核心印象：干净、年轻、可信，价格抢眼。

### 色板 token

| token | 值 | 用途 |
|---|---|---|
| `--bg` | `#F5F8FB` | 页面背景 |
| `--surface` | `#FFFFFF` | 卡片 / 面板 |
| `--brand` | `#0FA47F` | 主色：主按钮、选中态、认证徽章 |
| `--brand-deep` | `#0B7D60` | 主色深（hover / 文字强调） |
| `--price` | `#FF5A3C` | 价格、强调数字 |
| `--ink` | `#2B3440` | 主文字 |
| `--muted` | `#7C8AA0` | 次要文字 |
| `--line` | `#E3EAF2` | 边框 / 分隔线 |
| 状态色 | 在售 `#0FA47F` · 已预订 `#F5A623` · 已售出 `#7C8AA0` · 已下架 `#B8C2CE` | 商品状态徽标 |

圆角：卡片 10–12px、按钮 8px、胶囊 999px。阴影：`0 2px 8px rgba(20,40,80,.07)`。字体：系统栈（`-apple-system, "Segoe UI", "Microsoft YaHei"`），价格与数字加粗。

### 布局与关键页面

- **响应式**：≥1024px 三列瀑布流、768–1023 两列、<768 两列紧凑；聊天页移动端可用。
- **瀑布流零抖动**：`ItemImage` 的 `width/height` → 渲染时 `aspect-ratio` 占位 → 图片 `loading="lazy"`，无第三方库。
- **首页**：顶栏（logo / 搜索 / 发布按钮 / 头像+未读红点）、分类胶囊条、瀑布流卡片（图、标题两行截断、价格、"可小刀"标、校区地点）。
- **详情页**：左图右信息（移动端上下堆叠）、卖家卡、操作区（收藏 / 聊一聊）、公开留言。
- **聊天页**：左会话列表 + 右消息流（移动端单栏切换）；消息气泡、时间分组、已读标记、正在输入。
- **空状态与骨架屏**：所有列表有 skeleton；空列表有插图 + 引导文案（如"还没有商品，去发布第一件闲置吧"）。

---

## 7. 测试策略

- **单元测试（Vitest）**：密码哈希与校验、Session 签发/校验、`canTransition` 状态机、价格格式化、zod schema、未读数计算。TDD：这些纯逻辑先行。
- **集成测试**：独立 SQLite 测试库（每轮 migrate + 清理），覆盖关键 API 路径：注册 → 发布 → 收藏 → 建会话 → 发消息 → 标记售出 → 互评 → 管理员审核认证。
- **手动验收清单**：见 §10；双窗口实时聊天必须人工演示确认。
- **可选加分**：Playwright 冒烟一条链路（登录 → 发布 → 聊天）。

---

## 8. 非功能需求

- **性能**：游标分页、WebP、图片懒加载、RSC 首屏直出；列表页无 N+1（冗余计数器保证）。
- **安全**：bcrypt(cost 10)；登录失败统一文案防枚举；Prisma 参数化查询；上传双重校验（MIME + 真实解码）；React 默认转义，禁止 `dangerouslySetInnerHTML`；Session 哈希存储 + SameSite Cookie。
- **兼容**：桌面 Chrome / Edge 最新版优先；移动端基本可用即可。
- **无 VPN 可用（硬性）**：运行时零外部请求——字体、图标、图片、接口全部本地或同源；大陆网络或纯本地环境开箱即用；除 `npm install` 外不触碰任何外网。

---

## 9. 范围边界

**明确不做（YAGNI）**：在线支付、订单 / 物流系统、关注粉丝、站外推送、暗黑模式、多学校租户、留言楼中楼、评价追评删除、登录限速（应用层不实现）。

**未来扩展方向**（写在 README 里作为叙事）：OSS / CDN 图片存储、PostgreSQL 全文搜索、消息推送（Web Push）、举报自动风控、（如部署 Postgres）行级数据隔离多校区。

---

## 10. 验收标准

- [ ] `npm run setup`（install + migrate + seed）后 `npm run dev` 一条命令跑起全套
- [ ] seed 后首页 30+ 商品瀑布流，滚动流畅、无布局抖动
- [ ] 双浏览器窗口实时聊天全通：消息、未读红点、已读、正在输入、断线重连
- [ ] 完整闭环演示：注册 → 认证 → 发布 → 搜索 → 收藏 → 聊天 → 标记已售 → 互评 → 后台审核 / 下架 / 封禁
- [ ] 后台五个板块全部可用，仪表盘有数据
- [ ] Vitest 单元 + 集成测试全绿
- [ ] 浏览器控制台无报错
- [ ] **DevTools Network 面板确认：除 localhost 外零外部请求**（无 VPN 环境全功能可用）

---

## 附：目录结构

```
campus-market/
├─ prisma/
│  ├─ schema.prisma          12 张表
│  └─ seed.ts                演示数据：30+ 商品、多角色账号、历史会话与评价
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
└─ tests/                    Vitest 单元 + 集成
```

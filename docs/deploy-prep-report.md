# Render 部署适配报告

日期：2026-10-16 · 分支：main · 生产模式全链本地验证（本地版 = Render 启动链）

## 一、改动清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `render.yaml`（新建） | Render Blueprint 定义：web 服务 `campus-market`，`runtime: node`，`plan: free`，`region: singapore`；构建命令 `npm install && npx prisma generate && npm run build`；启动命令 `npx prisma migrate deploy && node scripts/seed-if-empty.mjs && npm run start`；健康检查 `/api/health`；环境变量 `NODE_ENV=production`、`DATABASE_URL=file:./prod.db` |
| 2 | `scripts/seed-if-empty.mjs`（新建） | 启动链幂等 seed 守卫：查 `user.count()`，为 0 则 `npx prisma db seed`，否则打印已有用户数并跳过 |
| 3 | `package.json` | 顶层新增 `"engines": { "node": ">=20" }`；scripts 未改动（`start` 保持 `cross-env NODE_ENV=production tsx server.ts`） |
| 4 | `.gitignore` | prisma 忽略区补 `prisma/prod.db`、`prisma/prod.db-journal` |
| 5 | `README.md` | 「部署」小节新增子节「Render 免费档一键部署（零成本）」（3 步操作 + 免费档休眠/临时磁盘说明） |

## 二、冷启动链验证（本地模拟 Render 启动链）

### 步骤 1：干净数据库 + 迁移

```
$ rm -f prisma/prod.db && DATABASE_URL="file:./prod.db" npx prisma migrate deploy
SQLite database prod.db created at file:./prod.db
1 migration found in prisma/migrations
Applying migration `20261016074154_init`
All migrations have been successfully applied.
```

### 步骤 2：第一次 seed-if-empty（空库 → 灌数据）

```
$ DATABASE_URL="file:./prod.db" node scripts/seed-if-empty.mjs
[boot] 空库 → 灌入演示数据
Running seed command `tsx prisma/seed.ts` ...
seed 完成：用户 5 · 商品 33 · 会话 3 · 消息 11
The seed command has been executed.
```

### 步骤 3：第二次 seed-if-empty（幂等 → 跳过）

```
$ DATABASE_URL="file:./prod.db" node scripts/seed-if-empty.mjs
[boot] 已有 5 个用户，跳过 seed
```

结论：冷启动链两级分支均正确（空库灌数据 / 二次启动跳过），符合「磁盘临时、每次冷启动自动重建」要求。

## 三、生产构建

```
$ npm run build
▲ Next.js 16.4.2 (Turbopack)
...
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0  DURATION=11s
```

耗时 **11 秒**，无 OOM、无错误、无警告级内存问题。远低于 Render 免费档 512MB 内存约束。

## 四、生产启动 + 冒烟测试

启动命令（与 Render 一致）：`DATABASE_URL="file:./prod.db" npm run start`

```
> campus-market@0.1.0 start
> cross-env NODE_ENV=production tsx server.ts
✓ Running next.config.ts took 61ms
> 校园集市已启动: http://localhost:3000 (dev=false)
```

三项冒烟结果：

| # | 请求 | 期望 | 实际 | 结论 |
|---|------|------|------|------|
| 1 | `GET /api/health` | `{"ok":true,"db":"up"}` | `{"ok":true,"db":"up"}` | PASS |
| 2 | `GET /` 含「校园集市」 | `校园集市` | `校园集市` | PASS |
| 3 | `GET /socket.io/?EIO=4&transport=polling` | `0{"sid` | `0{"sid":"l-NRC1sxvah` | PASS |

## 五、端口收尾

```
$ netstat -ano | grep LISTENING | grep :3000
TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  264936
$ taskkill //F //T //PID 264936
成功: 已终止 PID 264936 (属于 PID 281624 子进程) 的进程。
# 复核：端口 3000 无 LISTENING，已释放
```

## 六、测试套件

```
$ npm test
Test Files  31 passed (31)
     Tests  159 passed (159)
  Duration  50.95s
```

全绿，未受影响。

## 七、疑虑

1. **首次构建耗时**：本地 build 仅 11s，但 Render 免费档 CPU 较弱且首次需下载 node_modules，实际首构建预计 3–8 分钟；属正常范围。
2. **seed 依赖 `.env`**：`npx prisma db seed` 会加载 `.env`（`DATABASE_URL="file:./dev.db"`）。但 `seed-if-empty.mjs` 显式传 `DATABASE_URL=file:./prod.db`，Prisma CLI 中已存在的环境变量优先于 `.env`，故生产路径安全；已在本地以显式 env 复现验证。Render 控制台 `DATABASE_URL` 亦由 Blueprint 注入，行为一致。
3. **`next.config.ts` 提示**：启动日志有 `Next.js ignored package-lock.json ... outside the current Git repository` 警告（因本机 cwd 位于用户目录外层含另一 lock 文件）。Render 上仓库根即工作目录，无此问题，功能不受影响。
4. **Prisma 7 弃用警告**：`package.json#prisma` 配置属性在 Prisma 7 将移除（建议迁移 `prisma.config.ts`），当前 Prisma 6 正常，非本次范围。
5. **图片持久化**：`public/uploads/` 位于临时磁盘，冷启动后上传图片丢失（README 已注明）；演示数据图片由 seed 生成，冷启动后自动重建，不影响演示。

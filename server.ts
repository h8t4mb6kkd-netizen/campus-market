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

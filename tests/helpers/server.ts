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

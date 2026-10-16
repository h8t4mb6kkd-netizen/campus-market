import { spawn, spawnSync } from 'node:child_process'

export const TEST_PORT = 3517
export const TEST_BASE_URL = `http://localhost:${TEST_PORT}`

const PORT_FREE_TIMEOUT_MS = 8_000
const PORT_POLL_INTERVAL_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Windows：用 netstat 解析监听 3517 的 PID 列表。
 * 只认 LISTENING 行，避免把 TIME_WAIT 等残留连接误判为占用。
 */
function findListeningPids(port: number): number[] {
  if (process.platform !== 'win32') return []
  // netstat -ano | findstr :<port> —— 形如 `TCP 0.0.0.0:3517 0.0.0.0:0 LISTENING 12345`
  const result = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8' })
  const stdout = result.stdout ?? ''
  const pids = new Set<number>()
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || !/LISTENING/i.test(line)) continue
    const match = line.match(/(\d+)\s*$/)
    if (!match) continue
    const pid = Number(match[1])
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) pids.add(pid)
  }
  return [...pids]
}

async function isPortFree(): Promise<boolean> {
  return (await isPortListening()) === false
}

/** 端口是否仍有监听：优先 netstat（Windows），否则尝试 TCP 连接。 */
async function isPortListening(): Promise<boolean> {
  if (process.platform === 'win32') {
    return findListeningPids(TEST_PORT).length > 0
  }
  const net = await import('node:net')
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port: TEST_PORT, host: 'localhost' })
    const done = (listening: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(listening)
    }
    socket.setTimeout(1_000)
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.once('timeout', () => done(false))
  })
}

/** 按端口定位并强杀监听进程（taskkill /F /T）。返回是否发起了 kill。 */
function killByPort(): boolean {
  if (process.platform !== 'win32') return false
  const pids = findListeningPids(TEST_PORT)
  if (pids.length === 0) return false
  for (const pid of pids) {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
  }
  return true
}

/** 轮询等待 3517 释放；超时返回 false。 */
async function waitForPortFree(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortFree()) return true
    await sleep(PORT_POLL_INTERVAL_MS)
  }
  return await isPortFree()
}

/** spawn 前清掉占用 3517 的残留进程，确保新服务器能起来（Next dev 单实例检测）。 */
async function cleanupBeforeStart(): Promise<void> {
  if (await isPortFree()) return
  console.error(`[test-server] 端口 ${TEST_PORT} 已被占用，正在清理残留进程…`)
  killByPort()
  if (!(await waitForPortFree(PORT_FREE_TIMEOUT_MS))) {
    killByPort() // 再补一次
    if (!(await waitForPortFree(PORT_FREE_TIMEOUT_MS))) {
      console.error(`[test-server] 警告：端口 ${TEST_PORT} 在清理后仍未释放，继续尝试启动。`)
    }
  }
}

/** 等待子进程退出（Windows 上 taskkill 是异步的，必须等它自己结束）。 */
function taskkillAndWait(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    killer.once('exit', () => resolve())
    killer.once('error', () => resolve())
  })
}

export async function startTestServer(): Promise<{ stop: () => Promise<void> }> {
  await cleanupBeforeStart()

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
        await taskkillAndWait(child.pid!)
      } else {
        child.kill()
        return
      }
      // 等端口真正释放，避免下一轮 spawn 撞上「Another next dev server is already running」
      if (await waitForPortFree(PORT_FREE_TIMEOUT_MS)) return
      killByPort() // 超时：子进程可能已换 PID（npx → tsx），按端口补杀一次
      if (!(await waitForPortFree(PORT_FREE_TIMEOUT_MS))) {
        console.error(`[test-server] 警告：stop() 超时，端口 ${TEST_PORT} 可能仍有残留监听。`)
      }
    },
  }
}

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

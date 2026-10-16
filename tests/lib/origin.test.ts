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
    expect(() => ensureSameOrigin(req('POST', { origin: 'not-a-url', host: 'localhost:3000' }))).toThrowError('来源不合法')
  })
})

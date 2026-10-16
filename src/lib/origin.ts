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

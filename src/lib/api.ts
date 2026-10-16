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

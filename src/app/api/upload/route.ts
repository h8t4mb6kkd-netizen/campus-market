import { NextResponse } from 'next/server'
import { ApiError, errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { ensureSameOrigin } from '@/lib/origin'
import { storage } from '@/lib/storage'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    await requireUser(req)
    const form = await req.formData().catch(() => {
      throw new ApiError('VALIDATION', '请求格式不正确')
    })
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError('VALIDATION', '缺少图片文件')
    if (file.size > MAX_BYTES) throw new ApiError('VALIDATION', '图片不能超过 5MB')
    if (!ALLOWED_MIME.has(file.type)) throw new ApiError('VALIDATION', '仅支持 JPG / PNG / WebP')

    const buffer = Buffer.from(await file.arrayBuffer())
    let stored
    try {
      stored = await storage.putImage(buffer)
    } catch (err) {
      console.error('[upload] 图片处理失败:', err)
      throw new ApiError('VALIDATION', '文件不是有效图片')
    }
    return NextResponse.json(stored)
  } catch (err) {
    return errorResponse(err)
  }
}

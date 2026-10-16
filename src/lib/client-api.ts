'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields?: Record<string, string> }

export function useApi(): { request: <T>(url: string, init?: RequestInit) => Promise<ApiResult<T>> } {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()

  const request = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> => {
      let res: Response
      try {
        res = await fetch(url, {
          ...init,
          headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
        })
      } catch {
        toast.error('网络异常，请检查网络后重试')
        return { ok: false, message: '网络异常' }
      }
      if (res.status === 401) {
        toast.error('登录已过期，请重新登录')
        router.push(`/login?next=${encodeURIComponent(pathname)}`)
        return { ok: false, message: '未登录' }
      }
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const fields: Record<string, string> | undefined = body?.error?.fields
        const message: string = body?.error?.message ?? '操作失败，请稍后再试'
        if (!fields) toast.error(message)
        return { ok: false, message, fields }
      }
      return { ok: true, data: (body ?? {}) as T }
    },
    [router, pathname, toast],
  )

  return { request }
}

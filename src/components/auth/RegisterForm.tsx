'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useApi } from '@/lib/client-api'

export function RegisterForm() {
  const router = useRouter()
  const { request } = useApi()
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFieldErrors({})
    const form = new FormData(e.currentTarget)
    const result = await request<{ user: { id: string; username: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username'),
        email: form.get('email'),
        password: form.get('password'),
      }),
    })
    setLoading(false)
    if (result.ok) {
      router.push('/')
      router.refresh()
      return
    }
    if (result.fields) setFieldErrors(result.fields)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="昵称" name="username" required maxLength={20} error={fieldErrors.username} placeholder="同学们怎么称呼你" />
      <Input label="邮箱" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <Input label="密码" name="password" type="password" autoComplete="new-password" required minLength={8} error={fieldErrors.password} placeholder="至少 8 位" />
      <Button type="submit" loading={loading} className="w-full">注册并登录</Button>
      <p className="text-center text-sm text-muted">
        已有账号？<Link href="/login" className="font-semibold text-brand">直接登录</Link>
      </p>
    </form>
  )
}

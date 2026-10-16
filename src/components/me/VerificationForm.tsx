'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'

export function VerificationForm() {
  const router = useRouter()
  const toast = useToast()
  const { request } = useApi()
  const [proof, setProof] = useState<{ url: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    setUploading(false)
    if (res.status === 401) {
      toast.error('登录已过期，请重新登录')
      router.push('/login?next=%2Fme%2Fverification')
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      toast.error(body?.error?.message ?? '图片上传失败')
      return
    }
    setProof(await res.json())
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    if (!proof) {
      toast.error('请上传学生证照片')
      return
    }
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const result = await request('/api/verifications', {
      method: 'POST',
      body: JSON.stringify({ studentNo: form.get('studentNo'), proofImageUrl: proof.url }),
    })
    setLoading(false)
    if (result.ok) {
      toast.success('已提交，等待管理员审核')
      router.refresh()
    } else if (result.fields) {
      setFieldErrors(result.fields)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="学号" name="studentNo" required minLength={4} maxLength={20} placeholder="例如 2023010101"
        error={fieldErrors.studentNo} />
      <div>
        <span className="mb-1 block text-sm font-medium">学生证照片（含姓名与学号页）</span>
        <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-btn border border-dashed border-line bg-white text-sm text-muted hover:border-brand hover:text-brand">
          {proof ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proof.url} alt="学生证" className="h-full w-full rounded-btn object-contain p-2" />
          ) : (
            <>
              <Icon name="image" size={22} />
              {uploading ? '上传中…' : '点击上传'}
            </>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        </label>
      </div>
      <Button type="submit" loading={loading} className="w-full">提交认证</Button>
    </form>
  )
}

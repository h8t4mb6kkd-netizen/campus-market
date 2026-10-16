'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS } from '@/lib/constants'

interface StoredImage { url: string; width: number; height: number }

export interface PublishFormInitial {
  title: string
  description: string
  priceYuan: number
  negotiable: boolean
  category: string
  condition: string
  location: string
  images: StoredImage[]
}

export function PublishForm({ initial, itemId }: { initial?: PublishFormInitial; itemId?: string }) {
  const router = useRouter()
  const toast = useToast()
  const { request } = useApi()
  const [images, setImages] = useState<StoredImage[]>(initial?.images ?? [])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files).slice(0, 9 - images.length)) {
      const form = new FormData()
      form.append('file', file)
      // multipart 不能带 content-type: application/json，用裸 fetch
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (res.status === 401) {
        toast.error('登录已过期，请重新登录')
        router.push(`/login?next=${encodeURIComponent(itemId ? `/items/${itemId}/edit` : '/publish')}`)
        break
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error?.message ?? '图片上传失败')
        continue
      }
      const stored: StoredImage = await res.json()
      setImages((prev) => [...prev, stored])
    }
    setUploading(false)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    if (images.length === 0) {
      toast.error('请至少上传 1 张图片')
      return
    }
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      priceYuan: Number(form.get('price')),
      negotiable: form.get('negotiable') === 'on',
      category: form.get('category'),
      condition: form.get('condition'),
      location: form.get('location'),
      images,
    }
    const result = itemId
      ? await request<{ item: { id: string } }>(`/api/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await request<{ item: { id: string } }>('/api/items', { method: 'POST', body: JSON.stringify(payload) })
    setLoading(false)
    if (result.ok) {
      toast.success(itemId ? '已保存修改' : '发布成功')
      router.push(`/items/${result.data.item.id}`)
      router.refresh()
      return
    }
    if (result.fields) setFieldErrors(result.fields)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <span className="mb-1 block text-sm font-medium">商品图片（1–9 张，第一张为封面）</span>
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={image.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="size-20 rounded-btn object-cover" />
              {index === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1 text-[10px] text-white">封面</span>}
              <button type="button" aria-label="删除图片"
                onClick={() => setImages((prev) => prev.filter((i) => i.url !== image.url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white">
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
          {images.length < 9 && (
            <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-btn border border-dashed border-line bg-white text-xs text-muted hover:border-brand hover:text-brand">
              <Icon name={uploading ? 'image' : 'plus'} size={18} />
              {uploading ? '上传中' : '加图片'}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} />
            </label>
          )}
        </div>
        {fieldErrors.images && <p className="mt-1 text-xs text-[#d94f3d]">{fieldErrors.images}</p>}
      </div>

      <Input label="标题" name="title" required maxLength={60} defaultValue={initial?.title}
        placeholder="例如：《数据结构》严蔚敏 九成新" error={fieldErrors.title} />
      <Textarea label="描述" name="description" rows={5} required maxLength={2000} defaultValue={initial?.description}
        placeholder="成色细节、有无笔记、交易时间地点…" error={fieldErrors.description} />

      <div className="grid grid-cols-2 gap-4">
        <Input label="价格（元）" name="price" type="number" step="0.01" min="0.01" max="99999" required
          defaultValue={initial?.priceYuan} placeholder="15.00" error={fieldErrors.priceYuan} />
        <Input label="交易地点" name="location" required maxLength={40} defaultValue={initial?.location}
          placeholder="东区3号楼" error={fieldErrors.location} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">分类</span>
          <select name="category" defaultValue={initial?.category ?? 'BOOKS'}
            className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">成色</span>
          <select name="condition" defaultValue={initial?.condition ?? 'LIKE_NEW_90'}
            className="w-full rounded-btn border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand">
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>{CONDITION_LABELS[condition]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="negotiable" defaultChecked={initial?.negotiable ?? true} className="size-4 accent-[#0fa47f]" />
        接受砍价（可小刀）
      </label>

      <Button type="submit" loading={loading} className="w-full">
        {itemId ? '保存修改' : '发布'}
      </Button>
    </form>
  )
}

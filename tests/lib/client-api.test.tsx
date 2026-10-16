/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { useApi } from '@/lib/client-api'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/publish',
}))

function Demo() {
  const { request } = useApi()
  return <button onClick={() => void request('/api/anything', { method: 'POST' })}>发请求</button>
}

describe('useApi 的 401 处理', () => {
  beforeEach(() => pushMock.mockClear())

  it('401 → Toast 提示并跳转登录页（带 next）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '请先登录' } }), { status: 401 }),
    ))
    render(<ToastProvider><Demo /></ToastProvider>)
    await userEvent.click(screen.getByText('发请求'))
    expect(await screen.findByText('登录已过期，请重新登录')).toBeInTheDocument()
    expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fpublish')
  })

  it('字段级错误不弹 Toast、返回 fields 给表单内联显示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'VALIDATION', message: '输入有误', fields: { title: '太短' } } }), { status: 400 }),
    ))
    render(<ToastProvider><Demo /></ToastProvider>)
    await userEvent.click(screen.getByText('发请求'))
    await screen.findByRole('button', { name: '发请求' })
    expect(screen.queryByText('输入有误')).not.toBeInTheDocument()
  })
})

/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LoginForm } from '@/components/auth/LoginForm'
import { ToastProvider } from '@/components/ui/Toast'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  // useApi（LoginForm 经由 useApi 发请求）需要 usePathname 计算 401 后的 next 参数
  usePathname: () => '/login',
}))

describe('LoginForm', () => {
  beforeEach(() => pushMock.mockClear())

  it('登录成功后跳转首页', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', username: '小鹿' } }), { status: 200 }),
    ))
    render(<ToastProvider><LoginForm /></ToastProvider>)
    await userEvent.type(screen.getByLabelText('邮箱'), 'lu@campus.dev')
    await userEvent.type(screen.getByLabelText('密码'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
  })

  it('字段级错误内联显示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'VALIDATION', message: '输入有误', fields: { password: '密码至少 8 位' } } }), { status: 400 }),
    ))
    render(<ToastProvider><LoginForm /></ToastProvider>)
    await userEvent.type(screen.getByLabelText('邮箱'), 'lu@campus.dev')
    await userEvent.type(screen.getByLabelText('密码'), 'short')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('密码至少 8 位')).toBeInTheDocument()
  })
})

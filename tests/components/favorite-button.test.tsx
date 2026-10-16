/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FavoriteButton } from '@/components/item-detail/FavoriteButton'
import { ToastProvider } from '@/components/ui/Toast'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/items/i1',
}))

describe('FavoriteButton', () => {
  beforeEach(() => pushMock.mockClear())

  it('点击后乐观变为已收藏，服务端确认后计数更新', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ favorited: true, favoriteCount: 8 }), { status: 200 }),
    ))
    render(<ToastProvider><FavoriteButton itemId="i1" initialFavorited={false} initialCount={7} isLoggedIn /></ToastProvider>)
    await userEvent.click(screen.getByRole('button'))
    // 成功 PUT { favorited:true } 后按钮文案为「已收藏 8」（简报组件逐字渲染 `{favorited ? '已收藏' : '想要'} {count}`）
    await waitFor(() => expect(screen.getByText(/已收藏 8/)).toBeInTheDocument())
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/items/i1/favorite', expect.objectContaining({ method: 'PUT' })))
  })

  it('未登录时点击跳转登录页', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<ToastProvider><FavoriteButton itemId="i1" initialFavorited={false} initialCount={0} isLoggedIn={false} /></ToastProvider>)
    await userEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fitems%2Fi1')
  })
})

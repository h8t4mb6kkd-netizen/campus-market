/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommentSection } from '@/components/item-detail/CommentSection'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/items/i1',
}))

const comment = (content: string) => ({
  id: 'c1', content, createdAt: '2026-10-16T10:00:00.000Z',
  author: { id: 'u1', username: '小鹿', avatarUrl: null, verifiedAt: null },
})

describe('CommentSection', () => {
  it('HTML 按纯文本渲染，不产生可执行节点（Review Focus #4）', () => {
    const evil = '<img src=x onerror="alert(1)">'
    render(
      <ToastProvider>
        <CommentSection itemId="i1" initialComments={[comment(evil)]} currentUser={{ id: 'u2', username: '我', avatarUrl: null }} />
      </ToastProvider>,
    )
    expect(screen.getByText(evil)).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it('未登录显示登录引导，不显示输入框', () => {
    render(
      <ToastProvider>
        <CommentSection itemId="i1" initialComments={[]} currentUser={null} />
      </ToastProvider>,
    )
    // 「登录」是 <a> 子节点，TL 默认只匹配元素自身的直接文本节点，故先定位引导段再校验完整文案
    expect(screen.getByText(/后可留言/)).toHaveTextContent('登录后可留言')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

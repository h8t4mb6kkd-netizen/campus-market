/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Avatar } from '@/components/ui/Avatar'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ToastProvider, useToast } from '@/components/ui/Toast'

describe('StatusBadge', () => {
  it.each([
    ['ON_SALE', '在售'],
    ['RESERVED', '已预订'],
    ['SOLD', '已售出'],
    ['DELISTED', '已下架'],
  ] as const)('状态 %s → %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('Button', () => {
  it('loading 时禁用', () => {
    render(<Button loading>发布</Button>)
    expect(screen.getByRole('button', { name: /发布/ })).toBeDisabled()
  })
})

describe('EmptyState', () => {
  it('渲染标题与描述', () => {
    render(<EmptyState title="还没有商品" description="去发布第一件闲置吧" />)
    expect(screen.getByText('还没有商品')).toBeInTheDocument()
    expect(screen.getByText('去发布第一件闲置吧')).toBeInTheDocument()
  })
})

describe('Avatar', () => {
  it('无头像时回退为首字符', () => {
    render(<Avatar name="小鹿同学" />)
    expect(screen.getByText('小')).toBeInTheDocument()
  })
})

describe('Toast', () => {
  it('调用后显示消息，3 秒后消失', () => {
    vi.useFakeTimers()
    function Demo() {
      const toast = useToast()
      return <button onClick={() => toast.error('出错了')}>触发</button>
    }
    render(<ToastProvider><Demo /></ToastProvider>)
    fireEvent.click(screen.getByText('触发'))
    expect(screen.getByText('出错了')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3100) })
    expect(screen.queryByText('出错了')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const socketMock = {
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socketMock) }))

import { io } from 'socket.io-client'
import { useSocket } from '@/hooks/useSocket'

function Demo() {
  const { socket, connected } = useSocket()
  return (
    <div>
      {socket ? '有连接' : '无连接'}-{String(connected)}
    </div>
  )
}

describe('useSocket（共享连接生命周期）', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('挂载后建立连接、卸载后断连（refCount 归零）', async () => {
    const { unmount } = render(<Demo />)
    expect(await screen.findByText('有连接-false')).toBeInTheDocument()
    expect(io).toHaveBeenCalledTimes(1)
    unmount()
    expect(socketMock.disconnect).toHaveBeenCalledTimes(1)
  })

  it('多组件共享同一连接，全部卸载后才断连', async () => {
    render(
      <>
        <Demo />
        <Demo />
      </>,
    )
    expect(await screen.findAllByText('有连接-false')).toHaveLength(2)
    expect(io).toHaveBeenCalledTimes(1)
    cleanup()
    expect(socketMock.disconnect).toHaveBeenCalledTimes(1)
  })
})

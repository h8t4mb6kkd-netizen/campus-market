/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ItemCard } from '@/components/item/ItemCard'
import type { ItemCardData } from '@/lib/items'

const base: ItemCardData = {
  id: 'i1',
  title: '《数据结构》严蔚敏 九成新',
  priceCents: 1500,
  negotiable: true,
  location: '东区3号楼',
  status: 'ON_SALE',
  cover: { url: '/uploads/2026/a.webp', width: 800, height: 600 },
  seller: { id: 'u1', username: '小鹿', avatarUrl: null, verifiedAt: '2026-10-01T00:00:00.000Z' },
}

describe('ItemCard', () => {
  it('渲染价格、可小刀、认证徽章、地点，链接指向详情页', () => {
    render(<ItemCard item={base} />)
    expect(screen.getByText('¥15')).toBeInTheDocument()
    expect(screen.getByText('可小刀')).toBeInTheDocument()
    expect(screen.getByText('已认证')).toBeInTheDocument()
    expect(screen.getByText('东区3号楼')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/items/i1')
  })

  it('封面按库中宽高设 aspect-ratio（零抖动占位）', () => {
    render(<ItemCard item={base} />)
    const holder = screen.getByTestId('item-cover')
    expect(holder).toHaveStyle({ aspectRatio: '800 / 600' })
  })

  it('已售出商品显示角标', () => {
    render(<ItemCard item={{ ...base, status: 'SOLD' }} />)
    expect(screen.getByText('已售出')).toBeInTheDocument()
  })
})

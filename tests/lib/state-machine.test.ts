import { describe, expect, it } from 'vitest'
import { applyTransition, canTransition } from '@/lib/state-machine'

const seller = { actor: 'SELLER' as const }
const admin = { actor: 'ADMIN' as const }
const other = { actor: 'OTHER' as const }

describe('canTransition', () => {
  it('RESERVE：仅卖家 + 在售', () => {
    expect(canTransition('ON_SALE', 'RESERVE', seller)).toBeNull()
    expect(canTransition('ON_SALE', 'RESERVE', admin)).not.toBeNull()
    expect(canTransition('RESERVED', 'RESERVE', seller)).not.toBeNull()
    expect(canTransition('SOLD', 'RESERVE', seller)).not.toBeNull()
  })

  it('UNRESERVE：仅卖家 + 已预订', () => {
    expect(canTransition('RESERVED', 'UNRESERVE', seller)).toBeNull()
    expect(canTransition('ON_SALE', 'UNRESERVE', seller)).not.toBeNull()
  })

  it('MARK_SOLD：仅卖家 + 在售/已预订；SOLD 终态不可再操作', () => {
    expect(canTransition('ON_SALE', 'MARK_SOLD', seller)).toBeNull()
    expect(canTransition('RESERVED', 'MARK_SOLD', seller)).toBeNull()
    expect(canTransition('SOLD', 'MARK_SOLD', seller)).not.toBeNull()
    expect(canTransition('DELISTED', 'MARK_SOLD', seller)).not.toBeNull()
    expect(canTransition('ON_SALE', 'MARK_SOLD', admin)).not.toBeNull()
  })

  it('DELIST：卖家与管理员都可，SOLD/DELISTED 不可', () => {
    expect(canTransition('ON_SALE', 'DELIST', seller)).toBeNull()
    expect(canTransition('RESERVED', 'DELIST', admin)).toBeNull()
    expect(canTransition('SOLD', 'DELIST', admin)).not.toBeNull()
    expect(canTransition('DELISTED', 'DELIST', admin)).not.toBeNull()
  })

  it('RELIST：仅卖家；管理员下架的商品不可重新上架（Review Focus #2）', () => {
    expect(canTransition('DELISTED', 'RELIST', { ...seller, delistedBy: 'USER' })).toBeNull()
    expect(canTransition('DELISTED', 'RELIST', { ...seller, delistedBy: 'ADMIN' })).not.toBeNull()
    expect(canTransition('DELISTED', 'RELIST', admin)).not.toBeNull()
    expect(canTransition('ON_SALE', 'RELIST', seller)).not.toBeNull()
  })

  it('非卖家非管理员（OTHER）任何操作都拒绝', () => {
    expect(canTransition('ON_SALE', 'RESERVE', other)).not.toBeNull()
    expect(canTransition('ON_SALE', 'DELIST', other)).not.toBeNull()
  })
})

describe('applyTransition', () => {
  it.each([
    ['ON_SALE', 'RESERVE', 'RESERVED'],
    ['RESERVED', 'UNRESERVE', 'ON_SALE'],
    ['ON_SALE', 'MARK_SOLD', 'SOLD'],
    ['RESERVED', 'MARK_SOLD', 'SOLD'],
    ['ON_SALE', 'DELIST', 'DELISTED'],
    ['DELISTED', 'RELIST', 'ON_SALE'],
  ] as const)('%s --%s--> %s', (from, action, expected) => {
    expect(applyTransition(from, action)).toBe(expected)
  })
})

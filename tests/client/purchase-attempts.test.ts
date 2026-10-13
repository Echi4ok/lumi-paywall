import { describe, expect, it, vi } from 'vitest'
import { createPurchaseAttempts } from '../../app/features/paywall/api/purchase-attempts'

const requestId = '11111111-2222-4333-8444-555555555555'

describe('unconfirmed request persistence', () => {
  it('restores an unconfirmed key after reload and removes it after confirmation', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
      removeItem: (key: string) => {
        data.delete(key)
      },
    }
    createPurchaseAttempts(storage).set('yearly', requestId)
    const reloaded = createPurchaseAttempts(storage)
    expect(reloaded.get('yearly')).toBe(requestId)
    reloaded.delete('yearly')
    expect(createPurchaseAttempts(storage).get('yearly')).toBeUndefined()
    expect(data.size).toBe(0)
  })

  it('keeps in-memory retries working when reading and writing storage throw', () => {
    const blocked = vi.fn(() => {
      throw new Error('Storage disabled')
    })
    const attempts = createPurchaseAttempts({
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    })
    attempts.set('yearly', requestId)
    expect(attempts.get('yearly')).toBe(requestId)
    expect(() => attempts.delete('yearly')).not.toThrow()
  })

  it('ignores malformed or unrelated storage data', () => {
    const attempts = createPurchaseAttempts({
      getItem: () => JSON.stringify({ yearly: 'bad-key', monthly: 123, admin: requestId }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    expect(attempts.get('yearly')).toBeUndefined()
    expect(attempts.get('monthly')).toBeUndefined()
  })
})

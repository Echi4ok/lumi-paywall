import { describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createDeviceBootstrap } from '../../app/features/paywall/api/device-bootstrap'

const deviceId = '11111111-2222-4333-8444-555555555555'

describe('anonymous device bootstrap', () => {
  it('elects one persistent identity for concurrent independent tabs', async () => {
    const factory = new IDBFactory()
    const createId = vi.fn().mockReturnValue(deviceId)
    const identifiers = await Promise.all(
      Array.from({ length: 12 }, () =>
        createDeviceBootstrap(factory, createId)(new AbortController().signal),
      ),
    )

    expect(new Set(identifiers)).toEqual(new Set([deviceId]))
    expect(createId).toHaveBeenCalledTimes(1)
    const newId = vi.fn().mockReturnValue('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(await createDeviceBootstrap(factory, newId)(new AbortController().signal)).toBe(deviceId)
    expect(newId).not.toHaveBeenCalled()
  })

  it('does not generate a volatile identity when storage is unavailable', async () => {
    const createId = vi.fn().mockReturnValue(deviceId)
    expect(
      await createDeviceBootstrap(undefined, createId)(new AbortController().signal),
    ).toBeNull()
    expect(createId).not.toHaveBeenCalled()
  })

  it('finishes on cancellation even if opening storage never completes', async () => {
    const opening = {} as IDBOpenDBRequest
    const factory = { open: vi.fn().mockReturnValue(opening) } as unknown as IDBFactory
    const createId = vi.fn().mockReturnValue(deviceId)
    const lifecycle = new AbortController()
    const pending = createDeviceBootstrap(factory, createId)(lifecycle.signal)
    lifecycle.abort()

    expect(await pending).toBeNull()
    expect(createId).not.toHaveBeenCalled()
  })

  it('does not open storage when the operation was already cancelled', async () => {
    const factory = new IDBFactory()
    const open = vi.spyOn(factory, 'open')
    const lifecycle = new AbortController()
    lifecycle.abort()
    expect(await createDeviceBootstrap(factory)(lifecycle.signal)).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('returns no capability when persistence fails instead of returning an uncommitted ID', async () => {
    const factory = new IDBFactory()
    const createId = vi.fn(() => {
      throw new Error('Entropy unavailable')
    })
    expect(await createDeviceBootstrap(factory, createId)(new AbortController().signal)).toBeNull()
    expect(await createDeviceBootstrap(factory, () => deviceId)(new AbortController().signal)).toBe(
      deviceId,
    )
  })
})

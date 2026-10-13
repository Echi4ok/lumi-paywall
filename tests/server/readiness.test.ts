import { describe, expect, it, vi } from 'vitest'
import { createReadinessChecker } from '../../server/infrastructure/readiness'

function setup() {
  let time = 0
  const audit = vi.fn(async () => {})
  const probe = vi.fn(async () => {})
  const check = createReadinessChecker({ audit, probe, now: () => time })
  return {
    audit,
    probe,
    check,
    advance: (milliseconds: number) => {
      time += milliseconds
    },
  }
}

describe('bounded public readiness checks', () => {
  it('serves healthy bursts from cache and probes at most once per five seconds', async () => {
    const { audit, probe, check, advance } = setup()
    await Promise.all(Array.from({ length: 100 }, () => check()))
    expect(audit).toHaveBeenCalledTimes(1)
    advance(4_999)
    await Promise.all(Array.from({ length: 100 }, () => check()))
    expect(probe).not.toHaveBeenCalled()
    advance(1)
    await Promise.all(Array.from({ length: 100 }, () => check()))
    expect(probe).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledTimes(1)
  })

  it('shares one pending database check until it completes', async () => {
    let finish!: () => void
    const audit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const probe = vi.fn(async () => {})
    const check = createReadinessChecker({ audit, probe, now: () => 0 })
    const requests = Array.from({ length: 40 }, () => check())
    expect(audit).toHaveBeenCalledTimes(1)
    finish()
    await Promise.all(requests)
    expect(probe).not.toHaveBeenCalled()
  })

  it('bounds failed checks to one per second and recovers after that TTL', async () => {
    const { audit, check, advance } = setup()
    const offline = new Error('database unavailable')
    audit.mockRejectedValue(offline)
    const failed = await Promise.allSettled(Array.from({ length: 100 }, () => check()))
    expect(failed.every((result) => result.status === 'rejected')).toBe(true)
    expect(audit).toHaveBeenCalledTimes(1)
    advance(999)
    await expect(check()).rejects.toBe(offline)
    expect(audit).toHaveBeenCalledTimes(1)
    audit.mockResolvedValue()
    advance(1)
    await expect(check()).resolves.toBeUndefined()
    expect(audit).toHaveBeenCalledTimes(2)
  })

  it('detects an outage after healthy TTL and limits retries while the probe fails', async () => {
    const { check, probe, advance } = setup()
    await check()
    probe.mockRejectedValue(new Error('connection lost'))
    advance(5_000)
    await expect(check()).rejects.toThrow('connection lost')
    advance(999)
    await expect(check()).rejects.toThrow('connection lost')
    expect(probe).toHaveBeenCalledTimes(1)
    probe.mockResolvedValue()
    advance(1)
    await expect(check()).resolves.toBeUndefined()
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('audits the full schema every thirty seconds instead of every healthy probe', async () => {
    const { check, audit, probe, advance } = setup()
    await check()
    for (let index = 0; index < 5; index++) {
      advance(5_000)
      await check()
    }
    expect(audit).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledTimes(5)
    advance(5_000)
    await check()
    expect(audit).toHaveBeenCalledTimes(2)
    expect(probe).toHaveBeenCalledTimes(5)
  })

  it('also releases single-flight state after a synchronous adapter failure', async () => {
    let time = 0
    const audit = vi.fn((): Promise<void> => {
      throw new Error('adapter failed')
    })
    const check = createReadinessChecker({ audit, probe: async () => {}, now: () => time })
    await expect(check()).rejects.toThrow('adapter failed')
    time = 1_000
    audit.mockResolvedValue()
    await expect(check()).resolves.toBeUndefined()
    expect(audit).toHaveBeenCalledTimes(2)
  })

  it('does not let a late healthy probe postpone the thirty-second schema audit', async () => {
    const { check, audit, probe, advance } = setup()
    await check()
    advance(29_000)
    await check()
    expect(probe).toHaveBeenCalledTimes(1)
    advance(999)
    await check()
    expect(audit).toHaveBeenCalledTimes(1)
    advance(1)
    await check()
    expect(audit).toHaveBeenCalledTimes(2)
    expect(probe).toHaveBeenCalledTimes(1)
  })
})

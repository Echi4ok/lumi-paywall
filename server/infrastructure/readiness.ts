interface ReadinessDependencies {
  probe: () => Promise<unknown>
  audit: () => Promise<unknown>
  now?: () => number
}

/** Bound public health traffic per instance, including failures and concurrent requests. */
export function createReadinessChecker({
  probe,
  audit,
  now = () => Date.now(),
}: ReadinessDependencies) {
  let cached: { expiresAt: number; failed: boolean; error?: unknown } | undefined
  let lastAuditAt: number | undefined
  let inFlight: Promise<void> | undefined

  return async function check(): Promise<void> {
    if (cached && now() < cached.expiresAt) {
      if (cached.failed) throw cached.error
      return
    }
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        if (lastAuditAt === undefined || now() - lastAuditAt >= 30_000) {
          await audit()
          lastAuditAt = now()
        } else {
          await probe()
        }
        cached = { expiresAt: Math.min(now() + 5_000, lastAuditAt + 30_000), failed: false }
      } catch (error) {
        cached = { expiresAt: now() + 1_000, failed: true, error }
        throw error
      }
    })().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }
}

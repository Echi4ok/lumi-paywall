import { defineEventHandler } from 'h3'
import { persistDeviceId, readDeviceId } from '../http/device'
import { safely } from '../http/errors'
import { assertSameOrigin, noStore } from '../http/request'
import { getPaywallService } from '../infrastructure/services'
import { enforceRateLimit } from '../http/rate-limit'

export default defineEventHandler((event) =>
  safely(event, 'restore', async () => {
    noStore(event)
    assertSameOrigin(event)
    const deviceId = readDeviceId(event)
    if (!deviceId) return { purchase: null }
    await enforceRateLimit(event, 'restore', deviceId)
    const result = await (await getPaywallService()).restore(deviceId)
    if (result.purchase) persistDeviceId(event, deviceId)
    return result
  }),
)

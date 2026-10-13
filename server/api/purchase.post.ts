import { defineEventHandler } from 'h3'
import { persistDeviceId, requireDeviceId } from '../http/device'
import { safely } from '../http/errors'
import { assertSameOrigin, noStore, readPurchaseRequest } from '../http/request'
import { getPaywallService } from '../infrastructure/services'
import { enforceRateLimit } from '../http/rate-limit'

export default defineEventHandler((event) =>
  safely(event, 'purchase', async () => {
    noStore(event)
    assertSameOrigin(event)
    const deviceId = requireDeviceId(event)
    const input = await readPurchaseRequest(event)
    await enforceRateLimit(event, 'purchase', deviceId)
    const result = await (await getPaywallService()).purchase(deviceId, input)
    persistDeviceId(event, deviceId)
    return result
  }),
)

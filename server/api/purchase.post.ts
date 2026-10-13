import { defineEventHandler } from 'h3'
import { persistDeviceId, requireDeviceId } from '../http/device'
import { safely } from '../http/errors'
import { assertSameOrigin, noStore, readPurchaseRequest } from '../http/request'
import { getPaywallService } from '../infrastructure/services'

export default defineEventHandler((event) =>
  safely(async () => {
    noStore(event)
    assertSameOrigin(event)
    const deviceId = requireDeviceId(event)
    const input = await readPurchaseRequest(event)
    const result = await (await getPaywallService()).purchase(deviceId, input)
    persistDeviceId(event, deviceId)
    return result
  }),
)

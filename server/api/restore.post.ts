import { defineEventHandler } from 'h3'
import { persistDeviceId, readDeviceId } from '../http/device'
import { safely } from '../http/errors'
import { assertSameOrigin, noStore } from '../http/request'
import { getPaywallService } from '../infrastructure/services'

export default defineEventHandler((event) =>
  safely(async () => {
    noStore(event)
    assertSameOrigin(event)
    const deviceId = readDeviceId(event)
    if (!deviceId) return { purchase: null }
    const result = await (await getPaywallService()).restore(deviceId)
    if (result.purchase) persistDeviceId(event, deviceId)
    return result
  }),
)

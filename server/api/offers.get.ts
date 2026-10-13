import { defineEventHandler } from 'h3'
import { getOffers } from '../application/paywall-service'
import { ensureDeviceId } from '../http/device'
import { safely } from '../http/errors'
import { noStore } from '../http/request'
import { enforceRateLimit } from '../http/rate-limit'

export default defineEventHandler((event) =>
  safely(event, 'offers', async () => {
    noStore(event)
    const deviceId = ensureDeviceId(event)
    await enforceRateLimit(event, 'offers', deviceId)
    return getOffers()
  }),
)

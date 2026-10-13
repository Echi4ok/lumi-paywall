import { defineEventHandler } from 'h3'
import { getOffers } from '../application/paywall-service'
import { ensureDeviceId } from '../http/device'
import { safely } from '../http/errors'
import { noStore } from '../http/request'

export default defineEventHandler((event) =>
  safely(() => {
    noStore(event)
    ensureDeviceId(event)
    return getOffers()
  }),
)

import { defineEventHandler } from 'h3'
import { safely } from '../http/errors'
import { noStore } from '../http/request'
import { rateLimitSecret } from '../http/rate-limit'
import { checkDatabaseHealth } from '../infrastructure/services'

export default defineEventHandler((event) =>
  safely(event, 'health', async () => {
    noStore(event)
    rateLimitSecret()
    await checkDatabaseHealth()
    return { status: 'ok' }
  }),
)

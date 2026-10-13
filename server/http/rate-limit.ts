import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { getHeader, setHeader, type H3Event } from 'h3'
import { getRateLimiter } from '../infrastructure/services'
import { apiError } from './errors'
import { operationalError } from '../infrastructure/diagnostics'

export type RateLimitOperation = 'offers' | 'purchase' | 'restore'
const limits = {
  offers: { global: 1200, ip: 180, device: 120 },
  purchase: { global: 600, ip: 120, device: 30 },
  restore: { global: 1200, ip: 180, device: 60 },
} satisfies Record<RateLimitOperation, { global: number; ip: number; device: number }>

export function clientAddress(event: H3Event, environment = process.env): string {
  // Only Vercel's ingress overwrites this header. Self-hosting ignores forwarded input.
  const forwarded =
    environment.VERCEL === '1' && environment.NODE_ENV === 'production'
      ? getHeader(event, 'x-vercel-forwarded-for')?.split(',')[0]?.trim()
      : undefined
  const candidate = forwarded || event.node.req.socket.remoteAddress || 'unknown'
  return isIP(candidate) ? candidate.toLowerCase().replace(/^::ffff:/, '') : 'unknown'
}

export function rateLimitSecret(): string {
  // A deployment-wide secret makes stored IP/device digests resistant to enumeration.
  const secret =
    process.env.RATE_LIMIT_SECRET ||
    (process.env.NODE_ENV !== 'production' && !process.env.VERCEL ? 'local-development-only' : '')
  if (!secret || secret.length < 16)
    throw operationalError(
      'CONFIGURATION_ERROR',
      'RATE_LIMIT_SECRET is required in production (16+ characters)',
    )
  return secret
}

export async function enforceRateLimit(
  event: H3Event,
  operation: RateLimitOperation,
  deviceId: string,
) {
  const secret = rateLimitSecret()
  const digest = (value: string) => createHmac('sha256', secret).update(value).digest('hex')
  const policy = limits[operation]
  const result = await (
    await getRateLimiter()
  ).consume([
    { key: `${operation}:global`, limit: policy.global },
    { key: `${operation}:ip:${digest(clientAddress(event))}`, limit: policy.ip },
    { key: `${operation}:device:${digest(deviceId)}`, limit: policy.device },
  ])
  if (!result.allowed) {
    setHeader(event, 'Retry-After', result.retryAfter)
    throw apiError(
      429,
      'RATE_LIMITED',
      'Слишком много запросов. Подождите минуту и повторите попытку.',
    )
  }
}

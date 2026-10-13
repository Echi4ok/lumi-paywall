import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import offers from '../../server/api/offers.get'
import purchase from '../../server/api/purchase.post'
import restore from '../../server/api/restore.post'
import { getPaywallService } from '../../server/infrastructure/services'
import { DomainError } from '../../server/domain/errors'

vi.mock('../../server/infrastructure/services', () => ({ getPaywallService: vi.fn() }))

const receipt = {
  id: randomUUID(),
  offerId: 'yearly' as const,
  purchasedAt: '2026-10-13T12:00:00.000Z',
  expiresAt: '2027-10-13T12:00:00.000Z',
}
const service = { purchase: vi.fn(), restore: vi.fn() }
let server: Server
let origin: string

beforeAll(async () => {
  const app = createApp()
  const router = createRouter()
    .get('/api/offers', offers)
    .post('/api/purchase', purchase)
    .post('/api/restore', restore)
  app.use(router)
  server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server')
  origin = `http://127.0.0.1:${address.port}`
})
beforeEach(() => {
  vi.clearAllMocks()
  service.purchase.mockResolvedValue({ purchase: receipt, replayed: false })
  service.restore.mockResolvedValue({ purchase: receipt })
  vi.mocked(getPaywallService).mockResolvedValue(service)
  vi.stubEnv('APP_ORIGIN', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

const cookie = () => `lumi_device=${randomUUID()}`
function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('HTTP adapters', () => {
  it('offers establishes an opaque HttpOnly device cookie and disables caching', async () => {
    const response = await fetch(`${origin}/api/offers`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const setCookie = response.headers.get('set-cookie')!
    expect(setCookie).toMatch(/^lumi_device=[0-9a-f-]{36};/)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(await response.json()).toMatchObject({ offers: [{ id: 'monthly' }, { id: 'yearly' }] })
  })

  it('keeps an existing valid device identity', async () => {
    const response = await fetch(`${origin}/api/offers`, { headers: { cookie: cookie() } })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('marks the cookie Secure when running behind an HTTPS proxy', async () => {
    const response = await fetch(`${origin}/api/offers`, {
      headers: { 'x-forwarded-proto': 'https' },
    })
    expect(response.headers.get('set-cookie')).toContain('Secure')
  })

  it('requires the session before a purchase', async () => {
    const response = await post('/api/purchase', { offerId: 'yearly', requestId: randomUUID() })
    expect(response.status).toBe(401)
    expect(service.purchase).not.toHaveBeenCalled()
  })

  it('passes only validated request fields and cookie identity to the use case', async () => {
    const deviceId = randomUUID()
    const input = { offerId: 'yearly', requestId: randomUUID() }
    const response = await post('/api/purchase', input, { cookie: `lumi_device=${deviceId}` })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ purchase: receipt, replayed: false })
    expect(service.purchase).toHaveBeenCalledWith(deviceId, input)
  })

  it('renews the same device identity past the annual entitlement after a purchase', async () => {
    const deviceId = randomUUID()
    const response = await post(
      '/api/purchase',
      { offerId: 'yearly', requestId: randomUUID() },
      { cookie: `lumi_device=${deviceId}` },
    )
    expect(response.headers.get('set-cookie')).toContain(`lumi_device=${deviceId};`)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=34560000')
  })

  it('renews the same device identity after an active restore', async () => {
    const deviceId = randomUUID()
    const response = await post('/api/restore', undefined, { cookie: `lumi_device=${deviceId}` })
    expect(await response.json()).toEqual({ purchase: receipt })
    expect(response.headers.get('set-cookie')).toContain(`lumi_device=${deviceId};`)
  })

  it.each([
    { offerId: 'free', requestId: randomUUID() },
    { offerId: 'yearly', requestId: 'not-a-uuid' },
    { offerId: 'yearly', requestId: randomUUID(), priceMinor: 1 },
    { offerId: 'yearly', requestId: randomUUID(), deviceId: randomUUID() },
  ])('rejects invalid or additional fields: %j', async (body) => {
    const response = await post('/api/purchase', body, { cookie: cookie() })
    expect(response.status).toBe(400)
    expect(service.purchase).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const response = await fetch(`${origin}/api/purchase`, {
      method: 'POST',
      headers: { cookie: cookie(), 'content-type': 'application/json' },
      body: '{oops',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ data: { code: 'INVALID_JSON' } })
  })

  it('rejects form submissions to the JSON purchase endpoint', async () => {
    const response = await post(
      '/api/purchase',
      {},
      { cookie: cookie(), 'content-type': 'text/plain' },
    )
    expect(response.status).toBe(415)
  })

  it.each(['/api/purchase', '/api/restore'])('rejects a cross-origin call to %s', async (path) => {
    const response = await post(path, {}, { cookie: cookie(), origin: 'https://evil.example' })
    expect(response.status).toBe(403)
  })

  it('rejects cross-site fetch metadata even without an Origin', async () => {
    const response = await fetch(`${origin}/api/restore`, {
      method: 'POST',
      headers: { cookie: cookie(), 'sec-fetch-site': 'cross-site' },
    })
    expect(response.status).toBe(403)
  })

  it('rejects oversized JSON bodies', async () => {
    const response = await post(
      '/api/purchase',
      { payload: 'x'.repeat(2048) },
      { cookie: cookie() },
    )
    expect(response.status).toBe(413)
    expect(service.purchase).not.toHaveBeenCalled()
  })

  it('bounds streamed bodies without a content-length', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(2048)))
        controller.close()
      },
    })
    const response = await fetch(`${origin}/api/purchase`, {
      method: 'POST',
      headers: { cookie: cookie(), 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect(response.status).toBe(413)
  })

  it('restores nothing without a cookie and does not initialize storage', async () => {
    const response = await post('/api/restore')
    expect(await response.json()).toEqual({ purchase: null })
    expect(getPaywallService).not.toHaveBeenCalled()
  })

  it('maps idempotency conflicts to 409', async () => {
    service.purchase.mockRejectedValue(new DomainError('IDEMPOTENCY_CONFLICT'))
    const response = await post(
      '/api/purchase',
      { offerId: 'monthly', requestId: randomUUID() },
      { cookie: cookie() },
    )
    expect(response.status).toBe(409)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.json()).toMatchObject({ data: { code: 'IDEMPOTENCY_CONFLICT' } })
  })

  it('maps storage errors to a safe 503 without exposing query or credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    service.restore.mockRejectedValue(
      new Error('postgresql://private:secret@host SQL internal failure'),
    )
    const response = await post('/api/restore', undefined, { cookie: cookie() })
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).toContain('SERVICE_UNAVAILABLE')
    expect(body).not.toContain('secret')
    expect(body).not.toContain('SQL internal')
    expect(log).toHaveBeenCalledWith('[paywall] Operation failed', { type: 'Error' })
  })
})

/** Exercise actual HTTP routes and persistence; no mocks, SDKs or real charges. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.argv[2] || 'http://127.0.0.1:3000'
const origin = new URL(base).origin
let cookie = ''
const bootstrapId = randomUUID()
async function call(path, { method = 'GET', body, isolated = false } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(path === '/api/offers' ? { 'x-lumi-bootstrap': bootstrapId } : {}),
      ...(cookie && !isolated ? { cookie } : {}),
      ...(method === 'POST' ? { origin, 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!isolated && response.headers.get('set-cookie')) {
    cookie = response.headers.get('set-cookie').split(';')[0]
  }
  const data = await response.json()
  return { response, data }
}

const offers = await call('/api/offers')
assert.equal(offers.response.status, 200)
assert.equal(offers.data.offers.length, 2)
assert.ok(cookie, 'server establishes an anonymous device')
const empty = await call('/api/restore', { method: 'POST', body: {} })
assert.equal(empty.data.purchase, null)

const request = { offerId: 'yearly', requestId: randomUUID() }
const concurrent = await Promise.all(
  Array.from({ length: 12 }, () => call('/api/purchase', { method: 'POST', body: request })),
)
assert.ok(concurrent.every((result) => result.response.status === 200))
assert.equal(concurrent.filter((result) => result.data.replayed === false).length, 1)
assert.equal(new Set(concurrent.map((result) => result.data.purchase.id)).size, 1)
const purchased = concurrent[0]
assert.ok(concurrent.every((result) => result.data.active === true))
assert.equal(purchased.data.purchase.offerId, 'yearly')
assert.equal(purchased.data.purchase.requestId, request.requestId)
const receiptId = purchased.data.purchase.id
const retry = await call('/api/purchase', { method: 'POST', body: request })
assert.equal(retry.data.purchase.id, receiptId)
assert.equal(retry.data.replayed, true)
const restored = await call('/api/restore', { method: 'POST', body: {} })
assert.equal(restored.data.purchase.id, receiptId)
const conflict = await call('/api/purchase', {
  method: 'POST',
  body: { ...request, offerId: 'monthly' },
})
assert.equal(conflict.response.status, 409)
const invalid = await call('/api/purchase', {
  method: 'POST',
  body: { offerId: 'free', requestId: randomUUID() },
})
assert.equal(invalid.response.status, 400)
const otherDevice = await call('/api/restore', { method: 'POST', body: {}, isolated: true })
assert.equal(otherDevice.data.purchase, null)
const health = await call('/api/health')
assert.equal(health.response.status, 200)

console.log(
  JSON.stringify(
    {
      base,
      checks: 9,
      concurrentRequests: 12,
      purchaseId: receiptId,
      restored: true,
      idempotent: true,
      isolated: true,
    },
    null,
    2,
  ),
)

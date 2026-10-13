import { getHeader, getRequestURL, readRawBody, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { apiError } from './errors'

const purchaseSchema = z.strictObject({
  offerId: z.enum(['monthly', 'yearly']),
  requestId: z.uuid(),
})
const MAX_BODY_BYTES = 1024

function tooLarge() {
  return apiError(413, 'BODY_TOO_LARGE', 'Запрос слишком большой.')
}

async function readBoundedBody(event: H3Event): Promise<Buffer> {
  const request = event.node.req
  // Some serverless Node adapters supply a body already bounded by their ingress.
  if ('body' in request || 'rawBody' in request || '__unenv__' in request) {
    const raw = await readRawBody(event, false)
    if (raw && raw.byteLength > MAX_BODY_BYTES) throw tooLarge()
    return raw || Buffer.alloc(0)
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const cleanup = () => {
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onAborted)
      request.off('close', cleanup)
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      chunks.length = 0
      request.off('data', onData)
      request.off('end', onEnd)
      reject(error)
      // Discard further chunks without buffering; retain error/close listeners
      // until the request ends so an aborted oversized upload cannot crash Node.
      request.resume()
    }
    const onData = (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) fail(tooLarge())
      else chunks.push(chunk)
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(Buffer.concat(chunks))
    }
    const onError = () => {
      fail(apiError(400, 'INVALID_REQUEST', 'Запрос был прерван. Попробуйте ещё раз.'))
      cleanup()
    }
    const onAborted = () => {
      fail(apiError(400, 'INVALID_REQUEST', 'Запрос был прерван. Попробуйте ещё раз.'))
    }
    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
    request.once('close', cleanup)
  })
}

export function noStore(event: H3Event) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
}

/** SameSite cookies plus Origin/Fetch Metadata checks protect browser requests.
 * Native HTTP clients may omit Origin; they still need the opaque device cookie.
 */
export function assertSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  const site = getHeader(event, 'sec-fetch-site')
  const expected = process.env.APP_ORIGIN || getRequestURL(event, { xForwardedHost: false }).origin
  if (
    (origin && origin !== expected) ||
    site === 'cross-site' ||
    (!origin && site === 'same-site')
  ) {
    throw apiError(403, 'ORIGIN_FORBIDDEN', 'Этот запрос нельзя выполнить с другого сайта.')
  }
}

export async function readPurchaseRequest(event: H3Event) {
  const type = getHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json')
    throw apiError(415, 'JSON_REQUIRED', 'Ожидается запрос в формате JSON.')

  const declaredSize = Number(getHeader(event, 'content-length'))
  if (declaredSize > MAX_BODY_BYTES) throw tooLarge()

  const raw = await readBoundedBody(event)
  let input: unknown
  try {
    input = JSON.parse(raw.toString('utf8'))
  } catch {
    throw apiError(400, 'INVALID_JSON', 'Не удалось прочитать запрос. Попробуйте ещё раз.')
  }
  const parsed = purchaseSchema.safeParse(input)
  if (!parsed.success)
    throw apiError(400, 'INVALID_REQUEST', 'Проверьте выбранный тариф и повторите попытку.')
  return parsed.data
}

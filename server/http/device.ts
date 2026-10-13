import { randomUUID } from 'node:crypto'
import { getCookie, getRequestURL, setCookie, type H3Event } from 'h3'
import { z } from 'zod'
import { apiError } from './errors'

export const DEVICE_COOKIE = 'lumi_device'
const deviceIdSchema = z.uuid()

export function readDeviceId(event: H3Event): string | null {
  const value = deviceIdSchema.safeParse(getCookie(event, DEVICE_COOKIE))
  return value.success ? value.data : null
}

export function ensureDeviceId(event: H3Event): string {
  const existing = readDeviceId(event)
  if (existing) return existing
  const id = randomUUID()
  persistDeviceId(event, id)
  return id
}

/** Keep the device identity beyond the longest (365-day) access entitlement. */
export function persistDeviceId(event: H3Event, id: string): void {
  setCookie(event, DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRequestURL(event).protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
  })
}

export function requireDeviceId(event: H3Event): string {
  const id = readDeviceId(event)
  if (!id)
    throw apiError(
      401,
      'SESSION_REQUIRED',
      'Не удалось определить устройство. Обновите страницу и разрешите cookies.',
    )
  return id
}

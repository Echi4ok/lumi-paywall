import { randomUUID } from 'node:crypto'
import { createError, isError, setHeader, type H3Event } from 'h3'
import type { ApiErrorData } from '../../shared/contracts/paywall'
import { DomainError } from '../domain/errors'
import { safeErrorDetails } from '../infrastructure/diagnostics'

export function apiError(statusCode: number, code: string, message: string) {
  return createError({ statusCode, data: { code, message } satisfies ApiErrorData })
}

export async function safely<T>(
  event: H3Event,
  operation: 'offers' | 'purchase' | 'restore' | 'health',
  action: () => T | Promise<T>,
): Promise<T> {
  const requestId = randomUUID()
  setHeader(event, 'X-Request-Id', requestId)
  try {
    return await action()
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === 'INVALID_OFFER')
        throw apiError(400, error.code, 'Такого тарифа нет. Обновите страницу.')
      throw apiError(
        409,
        error.code,
        'Этот запрос уже использован для другого тарифа. Повторите покупку.',
      )
    }
    if (isError(error)) throw error
    // Do not serialize SQL, connection strings, device identifiers or stack traces.
    console.error('[paywall] Operation failed', {
      requestId,
      operation,
      status: 503,
      ...safeErrorDetails(error),
    })
    throw apiError(503, 'SERVICE_UNAVAILABLE', 'Сервис временно недоступен. Попробуйте ещё раз.')
  }
}

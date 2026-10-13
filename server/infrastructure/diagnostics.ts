/** Keep only protocol codes and known class names; never log arbitrary messages or causes. */
export function safeErrorDetails(error: unknown): { type: string; code?: string } {
  const candidate = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null
  const knownNames = [
    'Error',
    'TypeError',
    'NeonDbError',
    'DatabaseError',
    'TimeoutError',
    'AbortError',
  ]
  const type =
    typeof candidate?.name === 'string' && knownNames.includes(candidate.name)
      ? candidate.name
      : 'UnknownError'
  const code = candidate?.code ?? candidate?.cause?.code
  const safeCode =
    typeof code === 'string' &&
    (/^[0-9A-Z]{5}$/.test(code) ||
      [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'CONFIGURATION_ERROR',
        'SCHEMA_MISMATCH',
        'MIGRATION_INVALID',
      ].includes(code))
      ? code
      : undefined
  return { type, ...(safeCode ? { code: safeCode } : {}) }
}

export function operationalError(
  code: 'CONFIGURATION_ERROR' | 'SCHEMA_MISMATCH' | 'MIGRATION_INVALID',
  message: string,
): Error {
  return Object.assign(new Error(message), { code })
}

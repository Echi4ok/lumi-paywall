export type DomainErrorCode = 'INVALID_OFFER' | 'IDEMPOTENCY_CONFLICT'

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode) {
    super(code)
    this.name = 'DomainError'
  }
}

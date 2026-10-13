/** Only recognized error codes cross the transport boundary; provider messages stay private. */
export class PaywallApiError extends Error {
  constructor(
    readonly code: 'SESSION_REQUIRED' | 'BOOTSTRAP_REQUIRED' | 'RATE_LIMITED' | 'UNAVAILABLE',
  ) {
    super(code)
    this.name = 'PaywallApiError'
  }
}

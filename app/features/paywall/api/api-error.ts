/** Only recognized error codes cross the transport boundary; provider messages stay private. */
export class PaywallApiError extends Error {
  constructor(readonly code: 'SESSION_REQUIRED' | 'UNAVAILABLE') {
    super(code)
    this.name = 'PaywallApiError'
  }
}

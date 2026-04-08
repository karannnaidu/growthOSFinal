export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error('[Growth OS Error]', error.message, context)
  // TODO: Replace with Sentry.captureException(error, { extra: context })
  // when SENTRY_DSN is configured
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  console.log(`[Growth OS ${level}]`, message)
  // TODO: Replace with Sentry.captureMessage(message, level)
}

import { redactForLog } from './redact'

/**
 * The application's only logging surface.
 *
 * Everything passed through here is redacted first, so a signed URL, a JWT or
 * a field named like a credential cannot reach the console by accident. A
 * test asserts that no source file calls console.* directly, which is what
 * keeps this the only route.
 *
 * Confidential content — transcript text, meeting descriptions, daily work
 * entries — must not be logged at all, redacted or otherwise. Log identifiers
 * and outcomes, never the record itself.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

const ENABLED: Record<Level, boolean> = {
  debug: import.meta.env.DEV,
  info: import.meta.env.DEV,
  warn: true,
  error: true,
}

function emit(level: Level, message: string, context?: unknown) {
  if (!ENABLED[level]) return
  const payload = context === undefined ? undefined : redactForLog(context)
  const line = `[academicos] ${message}`
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  if (payload === undefined) sink(line)
  else sink(line, payload)
}

export const logger = {
  debug: (message: string, context?: unknown) => emit('debug', message, context),
  info: (message: string, context?: unknown) => emit('info', message, context),
  warn: (message: string, context?: unknown) => emit('warn', message, context),
  error: (message: string, context?: unknown) => emit('error', message, context),
}

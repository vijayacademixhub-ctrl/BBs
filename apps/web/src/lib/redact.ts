/**
 * Redaction for anything that might be written to a console or a log.
 *
 * Signed URLs carry an access token in the query string. A signed URL in a
 * log is a working key to a confidential recording for as long as it lives,
 * sitting somewhere with weaker access control than the recording itself.
 * The same applies to JWTs and refresh tokens.
 *
 * These helpers exist so there is a correct thing to reach for. A test
 * asserts that the application never calls console.* directly, which is what
 * makes reaching for them unavoidable.
 */

const SECRET_QUERY_KEYS = ['token', 'access_token', 'refresh_token', 'apikey', 'api_key', 'signature']
const SECRET_FIELD_PATTERN = /(token|password|secret|apikey|api_key|credential|authorization)/i
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g

/** Strips the credential from a URL, keeping enough to identify the object. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    let redacted = false
    for (const key of SECRET_QUERY_KEYS) {
      if (url.searchParams.has(key)) {
        // No brackets: URLSearchParams percent-encodes them, which makes the
        // marker harder to read in a log than the thing it replaced.
        url.searchParams.set(key, 'redacted')
        redacted = true
      }
    }
    // A Supabase signed URL carries its token in `token`. Anything else with
    // a query string is treated as potentially sensitive too, because the
    // cost of over-redacting a log line is nil.
    if (!redacted && url.search) {
      return `${url.origin}${url.pathname}?redacted`
    }
    return url.toString()
  } catch {
    return '[unparseable url redacted]'
  }
}

/** Replaces anything JWT-shaped in free text. */
export function redactTokens(value: string): string {
  return value.replace(JWT_PATTERN, '[redacted token]')
}

/**
 * Deep-redacts a value for logging: secret-looking fields are replaced,
 * URLs are stripped of credentials, and JWT-shaped strings are removed.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[too deep]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return redactTokens(value.startsWith('http://') || value.startsWith('https://') ? redactUrl(value) : value)
  }
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_FIELD_PATTERN.test(key) ? '[redacted]' : redactForLog(item, depth + 1)
  }
  return out
}

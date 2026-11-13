import { describe, expect, it } from 'vitest'
import { redactForLog, redactTokens, redactUrl } from '@/lib/redact'

/**
 * A signed URL is a bearer credential. Anyone holding one can fetch a
 * confidential recording without a session for as long as the signature
 * lives. These assertions protect the rule that such a value never reaches a
 * log, a console or an error report.
 */
describe('redactUrl', () => {
  it('strips the access token from a Supabase signed URL', () => {
    const signed =
      'https://proj.supabase.co/storage/v1/object/sign/meeting-recordings/team/meeting/rec.webm' +
      '?token=eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ4In0.abcdefghijklmno'
    const result = redactUrl(signed)
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(result).toContain('token=redacted')
    // The object path is kept: it identifies what was accessed without
    // granting access to it.
    expect(result).toContain('meeting-recordings')
  })

  it('redacts any query string it does not recognise', () => {
    expect(redactUrl('https://example.com/file?sig=abc123')).toBe(
      'https://example.com/file?redacted',
    )
  })

  it('leaves a plain URL alone', () => {
    expect(redactUrl('https://example.com/page')).toBe('https://example.com/page')
  })

  it('does not throw on malformed input', () => {
    expect(redactUrl('not a url at all')).toBe('[unparseable url redacted]')
  })
})

describe('redactTokens', () => {
  it('removes JWT-shaped strings from free text', () => {
    const text = 'request failed with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4'
    expect(redactTokens(text)).toBe('request failed with [redacted token]')
  })
})

describe('redactForLog', () => {
  it('replaces fields whose names suggest a secret', () => {
    const result = redactForLog({
      recordingId: 'abc',
      access_token: 'secret-value',
      refreshToken: 'another-secret',
      password: 'hunter2',
    }) as Record<string, unknown>

    expect(result.recordingId).toBe('abc')
    expect(result.access_token).toBe('[redacted]')
    expect(result.refreshToken).toBe('[redacted]')
    expect(result.password).toBe('[redacted]')
  })

  it('redacts a signed URL held in an innocuously named field', () => {
    const result = redactForLog({
      href: 'https://proj.supabase.co/storage/v1/object/sign/x/y.webm?token=eyJh.bbbbbbbb.cccccccc',
    }) as Record<string, string>
    expect(result.href).not.toContain('eyJh.bbbbbbbb.cccccccc')
  })

  it('walks nested structures', () => {
    const result = redactForLog({ outer: { inner: { api_key: 'k' } } }) as Record<string, any>
    expect(result.outer.inner.api_key).toBe('[redacted]')
  })

  it('does not recurse forever on a deep structure', () => {
    let deep: Record<string, unknown> = { value: 'end' }
    for (let i = 0; i < 20; i += 1) deep = { nested: deep }
    expect(() => redactForLog(deep)).not.toThrow()
  })
})

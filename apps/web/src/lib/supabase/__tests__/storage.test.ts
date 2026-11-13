import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Contract tests for signed-URL issuance.
 *
 * These exercise OUR side of the contract against a mocked client: the
 * lifetime requested, the ordering of the audit write, and what is and is not
 * logged.
 *
 * They do NOT verify that Supabase honours the expiry — that is server-side
 * behaviour and is listed as outstanding in
 * docs/security-hardening-report.md. What they do verify is that the
 * application asks for a short lifetime and never hands out a URL it has not
 * recorded, which is the part that can be got wrong here.
 */

const rpc = vi.fn()
const createSignedUrl = vi.fn()
const from = vi.fn(() => ({ createSignedUrl }))

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({ rpc, storage: { from } }),
}))

const consoleSpies = {
  info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
}

const SIGNED =
  'https://proj.supabase.co/storage/v1/object/sign/meeting-recordings/t/m/r.webm' +
  '?token=eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ4In0.SECRETSIGNATUREVALUE'

afterEach(() => {
  vi.clearAllMocks()
})

describe('createSignedUrl', () => {
  it('requests a short lifetime', async () => {
    rpc.mockResolvedValue({ error: null })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })

    const { createSignedUrl: mint, SIGNED_URL_TTL_SECONDS } = await import('../storage')
    await mint('meeting-recordings', 't/m/r.webm', 'recording', 'rec-1')

    expect(createSignedUrl).toHaveBeenCalledWith('t/m/r.webm', SIGNED_URL_TTL_SECONDS)
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300)
  })

  it('records the access BEFORE issuing the URL', async () => {
    const order: string[] = []
    rpc.mockImplementation(async () => {
      order.push('audit')
      return { error: null }
    })
    createSignedUrl.mockImplementation(async () => {
      order.push('sign')
      return { data: { signedUrl: SIGNED }, error: null }
    })

    const { createSignedUrl: mint } = await import('../storage')
    await mint('meeting-recordings', 't/m/r.webm', 'recording', 'rec-1')

    expect(order).toEqual(['audit', 'sign'])
    expect(rpc).toHaveBeenCalledWith('log_content_access', {
      p_entity_type: 'recording',
      p_entity_id: 'rec-1',
      p_note: null,
    })
  })

  it('issues nothing when the access cannot be recorded', async () => {
    // An unrecorded access to a confidential recording is worse than a failed
    // one, so the failure must be total rather than degraded.
    rpc.mockResolvedValue({ error: { message: 'audit unavailable' } })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })

    const { createSignedUrl: mint } = await import('../storage')
    await expect(mint('meeting-recordings', 't/m/r.webm', 'recording', 'rec-1')).rejects.toThrow(
      /could not be recorded/i,
    )
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('never writes the URL or its token to the console', async () => {
    rpc.mockResolvedValue({ error: null })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })

    const { createSignedUrl: mint } = await import('../storage')
    await mint('meeting-recordings', 't/m/r.webm', 'recording', 'rec-1')

    const everythingLogged = [
      ...consoleSpies.info.mock.calls,
      ...consoleSpies.warn.mock.calls,
      ...consoleSpies.error.mock.calls,
    ]
      .flat()
      .map((entry) => JSON.stringify(entry))
      .join(' ')

    expect(everythingLogged).not.toContain('SECRETSIGNATUREVALUE')
    expect(everythingLogged).not.toContain(SIGNED)
  })

  it('does not reveal whether a file exists when access is refused', async () => {
    // Distinguishing "no such object" from "not yours" tells the caller
    // something about files they are not entitled to know about.
    rpc.mockResolvedValue({ error: null })
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })

    const { createSignedUrl: mint } = await import('../storage')
    await expect(mint('meeting-recordings', 't/m/missing.webm', 'recording', 'rec-9')).rejects.toThrow(
      /not available, or you do not have access/i,
    )
  })

  it('reports an expiry that matches the requested lifetime', async () => {
    rpc.mockResolvedValue({ error: null })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })

    const { createSignedUrl: mint, SIGNED_URL_TTL_SECONDS, hasExpired } = await import('../storage')
    const before = Date.now()
    const file = await mint('meeting-recordings', 't/m/r.webm', 'recording', 'rec-1')

    const ttlMs = file.expiresAt.getTime() - before
    expect(ttlMs).toBeGreaterThan(0)
    expect(ttlMs).toBeLessThanOrEqual(SIGNED_URL_TTL_SECONDS * 1000 + 50)

    expect(hasExpired(file, new Date(before))).toBe(false)
    expect(hasExpired(file, new Date(before + SIGNED_URL_TTL_SECONDS * 1000 + 1))).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The setup checklist reports what is unfinished about a live installation,
 * and every item is detected rather than ticked. That is the whole point of
 * it, and it is also what makes it worth testing: a card which reports a
 * state it has not actually read would be worse than no card, because the two
 * security-relevant items — open sign-ups and unchanged passwords — would be
 * silently reassuring.
 *
 * So these tests drive the three sources it reads (Supabase's own auth
 * settings, the profiles table, the service status) and assert the card
 * follows them, including the case where a source cannot be read at all.
 */

const authSettings = { disable_signup: false, external: { google: false } }
let profiles: Array<{ full_name: string; password_set_at: string | null }> = []
let memberships: Array<{ role: string }> = []
let profilesError: unknown = null
let role = 'super_admin'
let calendarConfigured = false

vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ role }) }))

vi.mock('@/hooks/use-service-status', () => ({
  useServiceStatus: () => ({ status: { calendar: { configured: calendarConfigured } } }),
}))

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => ({
      select: () =>
        Promise.resolve(
          table === 'profiles'
            ? { data: profiles, error: profilesError }
            : { data: memberships, error: null },
        ),
    }),
  }),
}))

import { SetupChecklist } from '../components/setup-checklist'

const show = () => render(<MemoryRouter><SetupChecklist /></MemoryRouter>)

beforeEach(() => {
  role = 'super_admin'
  calendarConfigured = false
  profilesError = null
  authSettings.disable_signup = false
  authSettings.external.google = false
  profiles = [
    { full_name: 'Vijay Mourish DG', password_set_at: '2026-11-24T00:00:00Z' },
    { full_name: 'Member 05', password_set_at: null },
  ]
  memberships = [{ role: 'super_admin' }, { role: 'member' }]

  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(authSettings) } as Response),
  ))
})

describe('the setup checklist', () => {
  it('appears for a Super Admin and lists what is outstanding', async () => {
    show()
    expect(await screen.findByText('Finishing the setup')).toBeInTheDocument()
    expect(screen.getByText('Close public sign-ups')).toBeInTheDocument()
    expect(screen.getByText('Connect the Google service account')).toBeInTheDocument()
  })

  it('is not shown to anyone but the Super Admin, because no item is theirs to do', () => {
    role = 'member'
    show()
    expect(screen.queryByText('Finishing the setup')).not.toBeInTheDocument()
  })

  it('counts how many people have replaced the password they were issued', async () => {
    show()
    expect(await screen.findByText(/1 of 2 have set their own/)).toBeInTheDocument()
  })

  it('marks open sign-ups as needing attention today', async () => {
    show()
    await screen.findByText('Close public sign-ups')
    // Two items carry a live exposure: sign-ups are open and a password is
    // still the issued one. Both are flagged; the rest are merely unfinished.
    expect(screen.getAllByText('now')).toHaveLength(2)
  })

  it('drops an item from the list once it is done, and says how many are', async () => {
    // A finished item is removed rather than shown with a tick. The card is a
    // list of what is left, so a done item earns one line in the footer and
    // nothing more.
    authSettings.disable_signup = true
    show()
    await screen.findByText('Finishing the setup')
    expect(screen.queryByText('Close public sign-ups')).not.toBeInTheDocument()
    expect(screen.getByText(/1 already done/)).toBeInTheDocument()
    expect(screen.getByText('1 of 6 done')).toBeInTheDocument()
  })

  it('follows the service status for the Google service account', async () => {
    calendarConfigured = true
    show()
    await screen.findByText('Finishing the setup')
    expect(screen.queryByText('Connect the Google service account')).not.toBeInTheDocument()
  })

  it('says a signal could not be read rather than treating it as done', async () => {
    profilesError = { message: 'permission denied' }
    show()
    await screen.findByText('Finishing the setup')
    expect(screen.getAllByText('Could not be read.').length).toBeGreaterThan(0)
    // An unreadable signal must never be flagged as urgent either: urgency is
    // a claim about the live system, and nothing was learned about it.
    expect(
      screen.getByText('Everyone replaces the password they were issued').parentElement,
    ).not.toHaveTextContent('now')
  })

  it('disappears by itself when there is nothing left to do', async () => {
    authSettings.disable_signup = true
    authSettings.external.google = true
    calendarConfigured = true
    profiles = [{ full_name: 'Vijay Mourish DG', password_set_at: '2026-11-24T00:00:00Z' }]
    memberships = [{ role: 'super_admin' }, { role: 'super_admin' }]
    show()
    await waitFor(() =>
      expect(screen.queryByText('Finishing the setup')).not.toBeInTheDocument(),
    )
  })
})

import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { AppRole, Profile } from '@/types/domain'

/**
 * Authentication state.
 *
 * Two modes, and the interface always says which is in force:
 *
 *   'sample'   — no backend is configured. The application runs on local
 *                demonstration data and is labelled as such throughout. It
 *                does NOT claim anyone is signed in.
 *   'supabase' — a real session, a real profile, and a real role read from
 *                the database.
 *
 * The role held here is for drawing the interface only. It decides which
 * controls appear; it decides nothing about what data is returned. That is
 * settled by Row Level Security in PostgreSQL.
 */

export type AuthMode = 'sample' | 'supabase'

/**
 * Where the session stands with respect to multi-factor authentication.
 *
 *   'not_required'  — sample mode; there is no authentication at all
 *   'unknown'       — factors have not been read yet
 *   'enrol'         — signed in, no verified factor exists, must enrol
 *   'challenge'     — a factor exists but this session has not verified it
 *   'verified'      — aal2; confidential records are reachable
 */
export type MfaStage = 'not_required' | 'unknown' | 'enrol' | 'challenge' | 'verified'

export interface AuthState {
  mode: AuthMode
  status: 'loading' | 'signed_in' | 'signed_out' | 'suspended' | 'error'
  session: Session | null
  profile: Profile | null
  role: AppRole | null
  teamId: string | null
  error: string | null
  /** Where this session stands on the second factor. */
  mfaStage: MfaStage
  /** Re-reads the assurance level and factor list from Supabase. */
  refreshMfa: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = React.createContext<AuthState | null>(null)

const SAMPLE_PROFILE: Profile = {
  id: 'u1',
  fullName: 'Vijay Mourish DG',
  email: 'vijay@example.ac.in',
  role: 'super_admin',
  designation: 'Research Lead',
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [teamId, setTeamId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<AuthState['status']>(
    isSupabaseConfigured ? 'loading' : 'signed_in',
  )
  const [error, setError] = React.useState<string | null>(null)
  const [mfaStage, setMfaStage] = React.useState<MfaStage>(
    isSupabaseConfigured ? 'unknown' : 'not_required',
  )

  /**
   * Determines the MFA stage from Supabase rather than from local state.
   *
   * `getAuthenticatorAssuranceLevel()` reports what this session has reached
   * and what it could reach. A user with a verified factor who has not yet
   * answered the challenge has currentLevel aal1 and nextLevel aal2; a user
   * with no factor at all has both at aal1 and must enrol.
   *
   * This is only the interface's view. It decides which screen to show, not
   * what data is returned — the database refuses confidential rows to any
   * aal1 session regardless of what this function concludes.
   */
  const resolveMfaStage = React.useCallback(async (): Promise<MfaStage> => {
    if (!isSupabaseConfigured) return 'not_required'
    const supabase = getSupabase()
    const { data, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError || !data) return 'unknown'
    if (data.currentLevel === 'aal2') return 'verified'
    return data.nextLevel === 'aal2' ? 'challenge' : 'enrol'
  }, [])

  const refreshMfa = React.useCallback(async () => {
    setMfaStage(await resolveMfaStage())
  }, [resolveMfaStage])

  const loadProfile = React.useCallback(async (userId: string) => {
    const supabase = getSupabase()

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, designation, avatar_url, status')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
      setStatus('error')
      return
    }

    // A signed-in user with no readable profile has had their account removed
    // or was never provisioned. Treat it as no access rather than as a
    // partially working session.
    if (!profileRow) {
      setProfile(null)
      setStatus('suspended')
      setError('This account has no active profile. Contact the Super Admin.')
      return
    }

    if (profileRow.status !== 'active') {
      setProfile(null)
      setStatus('suspended')
      setError('This account has been suspended.')
      return
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('profile_id', userId)
      .limit(1)
      .maybeSingle()

    setProfile({
      id: profileRow.id,
      email: profileRow.email,
      fullName: profileRow.full_name,
      designation: profileRow.designation ?? '',
      avatarUrl: profileRow.avatar_url ?? undefined,
      role: (membership?.role as AppRole) ?? 'member',
    })
    setTeamId(membership?.team_id ?? null)
    setStatus('signed_in')
    setError(null)
  }, [])

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setProfile(SAMPLE_PROFILE)
      return
    }

    const supabase = getSupabase()
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
        void resolveMfaStage().then((stage) => {
          if (active) setMfaStage(stage)
        })
      } else {
        setStatus('signed_out')
        setMfaStage('unknown')
      }
    })

    // Covers sign-out in another tab, token refresh failure and session
    // expiry, so a stale tab cannot keep showing confidential data.
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (event === 'SIGNED_OUT' || !nextSession?.user) {
        setProfile(null)
        setTeamId(null)
        setStatus('signed_out')
        setMfaStage('unknown')
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadProfile(nextSession.user.id)
        // MFA_CHALLENGE_VERIFIED also arrives here on some versions; recomputing
        // on every session change keeps the stage honest without depending on
        // which event name a given release emits.
        void resolveMfaStage().then(setMfaStage)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile, resolveMfaStage])

  const signIn = React.useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return {
        error:
          'No backend is configured, so there is nothing to sign in to. ' +
          'The application is running on local demonstration data.',
      }
    }
    setStatus('loading')
    const { error: signInError } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (signInError) {
      setStatus('signed_out')
      // Deliberately not distinguishing "no such account" from "wrong
      // password": doing so tells an attacker which addresses exist.
      return { error: 'The email address or password is incorrect.' }
    }
    return { error: null }
  }, [])

  const signOut = React.useCallback(async () => {
    if (isSupabaseConfigured) {
      await getSupabase().auth.signOut()
    }
    setSession(null)
    setProfile(null)
    setTeamId(null)
    setStatus(isSupabaseConfigured ? 'signed_out' : 'signed_in')
    setMfaStage(isSupabaseConfigured ? 'unknown' : 'not_required')
  }, [])

  const refresh = React.useCallback(async () => {
    if (isSupabaseConfigured && session?.user) {
      await loadProfile(session.user.id)
    }
  }, [session, loadProfile])

  const value = React.useMemo<AuthState>(
    () => ({
      mode: isSupabaseConfigured ? 'supabase' : 'sample',
      status,
      session,
      profile,
      role: profile?.role ?? null,
      teamId,
      error,
      mfaStage,
      refreshMfa,
      signIn,
      signOut,
      refresh,
    }),
    [status, session, profile, teamId, error, mfaStage, refreshMfa, signIn, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/**
 * Convenience for drawing role-dependent controls.
 *
 * Presentation only. Never use it to decide whether data may be fetched:
 * the database decides that, and it is the only thing that can.
 */
export function useHasRole(roles: AppRole[]): boolean {
  const { role } = useAuth()
  return role !== null && roles.includes(role)
}

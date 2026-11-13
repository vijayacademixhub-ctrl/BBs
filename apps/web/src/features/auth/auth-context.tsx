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

export interface AuthState {
  mode: AuthMode
  status: 'loading' | 'signed_in' | 'signed_out' | 'suspended' | 'error'
  session: Session | null
  profile: Profile | null
  role: AppRole | null
  teamId: string | null
  error: string | null
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
      } else {
        setStatus('signed_out')
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
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadProfile(nextSession.user.id)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

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
      signIn,
      signOut,
      refresh,
    }),
    [status, session, profile, teamId, error, signIn, signOut, refresh],
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

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase browser client.
 *
 * Only the publishable (anon) key is used here, and that is by design: it is
 * meant to be public, and it grants nothing on its own. Every row the browser
 * can reach is decided by Row Level Security against the signed-in user's
 * JWT, not by the key.
 *
 * The service-role key must never appear in this file, in any VITE_ variable,
 * or anywhere else in this package. Vite inlines VITE_ variables into the
 * published bundle, so placing a secret there publishes it.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * Whether a backend is configured at all.
 *
 * When it is not, the application runs in Milestone 1 demonstration mode
 * against local sample data and says so. It does not pretend to be signed in,
 * and it does not pretend to have saved anything.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey)

let cached: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }
  if (!cached) {
    cached = createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: { headers: { 'x-application-name': 'academicos-web' } },
    })
  }
  return cached
}

/** Guards against the single most damaging configuration mistake. */
if (import.meta.env.DEV && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
  if (key.includes('service_role') || key.startsWith('sb_secret_')) {
    throw new Error(
      'A service-role or secret key has been placed in VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'That key bypasses Row Level Security and would be published in the browser bundle. ' +
        'Use the publishable (anon) key.',
    )
  }
}

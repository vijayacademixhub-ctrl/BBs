import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Circle, ClipboardCheck, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { useServiceStatus } from '@/hooks/use-service-status'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'

/**
 * What is still unfinished about this installation.
 *
 * Every item is *detected*, never ticked by hand. A checklist you tick
 * yourself records what you believe; this records what is true. The
 * difference matters for the two items that are security-relevant — open
 * sign-ups and unchanged passwords — where a stale tick would be worse than
 * no list at all.
 *
 * It appears for the Super Admin only, because every item is theirs to do,
 * and it disappears by itself once there is nothing left. Nothing to dismiss
 * and nothing to remember.
 */

interface Item {
  id: string
  label: string
  detail: string
  done: boolean
  /** Shown first and in red: unfinished and carrying a real risk today. */
  urgent?: boolean
  action?: { label: string; href: string; external?: boolean }
}

interface Signals {
  signUpsOpen: boolean | null
  googleEnabled: boolean | null
  superAdmins: number | null
  placeholders: number | null
  members: number | null
  passwordsSet: number | null
}

const EMPTY: Signals = {
  signUpsOpen: null,
  googleEnabled: null,
  superAdmins: null,
  placeholders: null,
  members: null,
  passwordsSet: null,
}

export function SetupChecklist() {
  const { role } = useAuth()
  const { status } = useServiceStatus()
  const [signals, setSignals] = useState<Signals>(EMPTY)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    void (async () => {
      const next: Signals = { ...EMPTY }

      // Supabase reports its own auth configuration, so neither of these is
      // something the application has to be told separately.
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL as string}/auth/v1/settings`,
          { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string } },
        )
        if (response.ok) {
          const body = (await response.json()) as {
            disable_signup?: boolean
            external?: Record<string, boolean>
          }
          next.signUpsOpen = body.disable_signup === false
          next.googleEnabled = body.external?.google === true
        }
      } catch {
        // Left null: unknown is shown as unknown rather than as done.
      }

      try {
        const supabase = getSupabase()
        const [people, admins] = await Promise.all([
          supabase.from('profiles').select('full_name, password_set_at'),
          supabase.from('team_members').select('role'),
        ])

        const rows = (people.data ?? []) as Array<{
          full_name: string
          password_set_at: string | null
        }>
        if (!people.error) {
          next.members = rows.length
          next.placeholders = rows.filter((r) => /^Member \d+$/.test(r.full_name)).length
          next.passwordsSet = rows.filter((r) => r.password_set_at).length
        }
        if (!admins.error) {
          next.superAdmins = ((admins.data ?? []) as Array<{ role: string }>).filter(
            (r) => r.role === 'super_admin',
          ).length
        }
      } catch {
        // Same again: a failure to read leaves the item unknown.
      }

      if (active) setSignals(next)
    })()

    return () => {
      active = false
    }
  }, [])

  if (role !== 'super_admin' || !isSupabaseConfigured) return null

  const items: Item[] = [
    {
      id: 'signups',
      label: 'Close public sign-ups',
      detail:
        signals.signUpsOpen === null
          ? 'Could not be read from Supabase.'
          : signals.signUpsOpen
            ? 'Anyone can currently create an account. They would reach no data, but they would exist.'
            : 'Sign-ups are closed. Accounts can only be created by you.',
      done: signals.signUpsOpen === false,
      urgent: signals.signUpsOpen === true,
      action: {
        label: 'Supabase → Authentication',
        href: 'https://supabase.com/dashboard/project/prxfztbafgbnxnglqaje/auth/providers',
        external: true,
      },
    },
    {
      id: 'passwords',
      label: 'Everyone replaces the password they were issued',
      detail:
        signals.passwordsSet === null || signals.members === null
          ? 'Could not be read.'
          : `${signals.passwordsSet} of ${signals.members} have set their own. Until someone does, whoever passed them their first password can still sign in as them.`,
      done: signals.members !== null && signals.passwordsSet === signals.members,
      urgent:
        signals.members !== null &&
        signals.passwordsSet !== null &&
        signals.passwordsSet < signals.members,
      action: { label: 'Settings → Password', href: '/settings' },
    },
    {
      id: 'admin',
      label: 'Enrol a second Super Admin',
      detail:
        signals.superAdmins === null
          ? 'Could not be read.'
          : signals.superAdmins < 2
            ? 'You are the only one, and that account needs an authenticator app. A lost phone would leave nobody able to add people or schedule meetings.'
            : `${signals.superAdmins} administrators. A lost phone no longer stops the team.`,
      done: (signals.superAdmins ?? 0) >= 2,
      action: {
        label: 'Supabase → team_members',
        href: 'https://supabase.com/dashboard/project/prxfztbafgbnxnglqaje/editor',
        external: true,
      },
    },
    {
      id: 'google',
      label: 'Connect the Google service account',
      detail: status.calendar.configured
        ? 'Calendar blocking and Drive synchronisation are available.'
        : 'Calendar blocking and Drive synchronisation are both waiting on it. One service account covers both.',
      done: status.calendar.configured,
      action: {
        label: 'The nine steps',
        href: 'https://github.com/vijayacademixhub-ctrl/BBs/blob/claude/exciting-davinci-brt4gr/docs/google-workspace-setup.md',
        external: true,
      },
    },
    {
      id: 'names',
      label: 'Name the placeholder accounts',
      detail:
        signals.placeholders === null
          ? 'Could not be read.'
          : signals.placeholders > 0
            ? `${signals.placeholders} accounts are still called "Member 05" and so on.`
            : 'Every account carries a real name.',
      done: signals.placeholders === 0,
      action: {
        label: 'Supabase → profiles',
        href: 'https://supabase.com/dashboard/project/prxfztbafgbnxnglqaje/editor',
        external: true,
      },
    },
    {
      id: 'jain',
      label: 'Allow signing in with a Jain University address',
      detail: signals.googleEnabled
        ? 'Google sign-in is enabled.'
        : 'Optional. Needs an OAuth client, and each person’s email changed to their real address.',
      done: signals.googleEnabled === true,
      action: {
        label: 'Steps 6 to 9',
        href: 'https://github.com/vijayacademixhub-ctrl/BBs/blob/claude/exciting-davinci-brt4gr/docs/google-workspace-setup.md',
        external: true,
      },
    },
  ]

  const outstanding = items.filter((item) => !item.done)
  if (outstanding.length === 0) return null

  // Unfinished first, and anything carrying a risk today above that.
  const ordered = [...outstanding].sort(
    (a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)),
  )
  const done = items.length - outstanding.length

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4" /> Finishing the setup
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Checked against the live system each time this page loads, not ticked by hand.{' '}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://github.com/vijayacademixhub-ctrl/BBs/blob/claude/exciting-davinci-brt4gr/docs/setup-walkthrough.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                How to do each of these
              </a>
              .
            </p>
          </div>
          <Badge variant={ordered.some((i) => i.urgent) ? 'warning' : 'outline'}>
            {done} of {items.length} done
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-1">
          {ordered.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-md px-2 py-2">
              {item.urgent ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {item.label}
                  {item.urgent ? (
                    <Badge variant="warning" className="ml-2">
                      now
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>

              {item.action ? (
                <Button variant="ghost" size="sm" className="shrink-0" asChild>
                  {item.action.external ? (
                    <a href={item.action.href} target="_blank" rel="noopener noreferrer">
                      {item.action.label}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <Link to={item.action.href}>
                      {item.action.label}
                      <ChevronRight className="size-3.5" />
                    </Link>
                  )}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        {done > 0 ? (
          <p className="mt-2 flex items-center gap-1.5 border-t px-2 pt-3 text-xs text-muted-foreground">
            <Check className="size-3.5 text-success" aria-hidden />
            {done} already done. This card disappears when the list is empty.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

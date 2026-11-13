import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { useAuth } from './auth-context'

/**
 * Enrolment and challenge for the second factor.
 *
 * One screen covers both because they are one journey: a user who has no
 * factor enrols and immediately verifies; a user who has one is asked for a
 * code. Splitting them into separate routes would add a redirect and a state
 * that can be reached by going back.
 *
 * The TOTP secret is shown exactly once, during enrolment. Supabase does not
 * return it again, and there is no way to recover it afterwards — see
 * docs/mfa-setup.md for what that means for recovery.
 */

type Phase = 'loading' | 'enrol' | 'challenge' | 'done' | 'unavailable'

export function MfaPage() {
  const { mfaStage, refreshMfa, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('loading')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const beginEnrolment = useCallback(async () => {
    const supabase = getSupabase()

    // An abandoned attempt leaves an unverified factor behind. Clearing it
    // avoids accumulating dead factors on the account, which would clutter
    // the list and eventually reach the per-user factor limit.
    //
    // `listFactors().totp` contains only VERIFIED factors; unverified ones
    // appear in `all`, which is why that is what is read here.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const factor of existing?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
    }

    const { data, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `AcademicOS (${new Date().toISOString().slice(0, 10)})`,
    })

    if (enrolError || !data) {
      logger.error('MFA enrolment could not be started', { reason: enrolError?.message })
      setError(
        enrolError?.message ??
          'Enrolment could not be started. Contact the Super Admin if this continues.',
      )
      setPhase('unavailable')
      return
    }

    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setPhase('enrol')
  }, [])

  const beginChallenge = useCallback(async () => {
    const supabase = getSupabase()
    // `totp` here is already filtered to verified factors.
    const { data } = await supabase.auth.mfa.listFactors()
    const verified = data?.totp?.[0]
    if (!verified) {
      await beginEnrolment()
      return
    }
    setFactorId(verified.id)
    setPhase('challenge')
  }, [beginEnrolment])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setPhase('unavailable')
      return
    }
    if (started.current) return
    started.current = true

    if (mfaStage === 'verified') {
      setPhase('done')
      navigate('/dashboard', { replace: true })
      return
    }
    void (mfaStage === 'challenge' ? beginChallenge() : beginEnrolment())
  }, [mfaStage, beginChallenge, beginEnrolment, navigate])

  async function submitCode(event: React.FormEvent) {
    event.preventDefault()
    if (!factorId) return
    setBusy(true)
    setError(null)

    const supabase = getSupabase()
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challenge) {
      setError('The verification step could not be started. Try again.')
      setBusy(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })

    if (verifyError) {
      // Deliberately generic. Distinguishing "wrong code" from "expired code"
      // tells someone guessing which half of the problem to work on.
      setError('That code was not accepted. Check your authenticator app and try again.')
      setCode('')
      setBusy(false)
      return
    }

    await refreshMfa()
    setBusy(false)
    navigate('/dashboard', { replace: true })
  }

  if (phase === 'unavailable') {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-warning" aria-hidden /> Two-factor setup unavailable
            </CardTitle>
            <CardDescription>
              {isSupabaseConfigured
                ? (error ?? 'Enrolment could not be started.')
                : 'No backend is configured, so there is no account to protect. The application is running on local demonstration data.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void signOut().then(() => navigate('/login'))}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (phase === 'loading' || phase === 'done') {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Preparing two-factor authentication…
          </CardContent>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {phase === 'enrol' ? 'Set up two-factor authentication' : 'Enter your verification code'}
          </CardTitle>
          <CardDescription>
            {phase === 'enrol'
              ? 'AcademicOS holds confidential institutional records, so a second factor is required for every account.'
              : `Signed in as ${profile?.email ?? 'your account'}. Enter the six-digit code from your authenticator app.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {phase === 'enrol' && qrCode ? (
            <div className="space-y-3">
              <ol className="space-y-1.5 text-sm text-muted-foreground">
                <li>1. Open an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
                <li>2. Scan the code below.</li>
                <li>3. Enter the six-digit code it shows.</li>
              </ol>

              <div className="flex justify-center rounded-lg border bg-card p-3">
                {/* Supabase returns the QR code as an inline SVG data URI. */}
                <img src={qrCode} alt="Two-factor authentication setup code" className="size-44" />
              </div>

              {secret ? (
                <details className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Cannot scan the code?
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    Enter this key manually. It is shown once and cannot be retrieved later.
                  </p>
                  <code className="mt-2 block break-all rounded bg-card px-2 py-1.5 font-mono text-xs">
                    {secret}
                  </code>
                </details>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={submitCode} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Six-digit code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-invalid={Boolean(error)}
                className="font-mono tracking-[0.3em]"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              <KeyRound /> {busy ? 'Verifying…' : phase === 'enrol' ? 'Verify and finish setup' : 'Verify'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            Lost access to your authenticator? Only the Super Admin can reset it, after confirming
            your identity. There are no self-service recovery codes.
          </p>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => void signOut().then(() => navigate('/login'))}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-5">{children}</div>
    </div>
  )
}

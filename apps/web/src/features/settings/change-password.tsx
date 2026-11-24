import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/common/toast'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'

/**
 * Changing your own password.
 *
 * Accounts are created by an administrator, which means everyone's first
 * password was chosen by somebody else and travelled to them through some
 * channel — a message, a note, a conversation. Until they can replace it, the
 * administrator and whatever carried it still know how to sign in as them.
 * That is the gap this closes, and it is why it exists rather than waiting
 * for a fuller account-management screen.
 *
 * The new password is sent straight to Supabase Auth, which hashes it. It is
 * never written to a table, logged, or held anywhere this application can
 * read it back.
 */
export function ChangePassword() {
  const { toast } = useToast()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isSupabaseConfigured) return null

  const tooShort = next.length > 0 && next.length < 10
  const mismatch = confirm.length > 0 && next !== confirm
  const ready = next.length >= 10 && next === confirm && !busy

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) throw new Error(error.message)

      // Record that this account no longer uses the password it was issued.
      // A timestamp only — never the password, and nothing derived from it.
      // Failing to write it must not make a successful change look failed,
      // so the result is deliberately not checked.
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ password_set_at: new Date().toISOString() })
          .eq('id', data.user.id)
      }

      setNext('')
      setConfirm('')
      toast({
        title: 'Password changed',
        description: 'Use the new one from your next sign-in.',
        tone: 'success',
      })
    } catch (error) {
      toast({
        title: 'The password was not changed',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Password
        </CardTitle>
        <CardDescription>
          Your account was created with a password someone else chose. Replace it with one only
          you know.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              aria-invalid={tooShort}
            />
            <p className="text-xs text-muted-foreground">
              At least 10 characters. Longer matters more than complicated.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Repeat it</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch ? (
              <p className="text-xs text-destructive">The two entries do not match.</p>
            ) : null}
          </div>

          <div>
            <Button type="submit" disabled={!ready}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

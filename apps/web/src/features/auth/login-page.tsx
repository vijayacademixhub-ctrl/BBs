import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { z } from 'zod'
import { GraduationCap, Lock, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type Values = z.infer<typeof schema>

export function LoginPage() {
  const { status, mode, signIn, error: authError } = useAuth()
  const location = useLocation()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  // In sample mode the application has no authentication at all. Redirecting
  // straight past this page would hide that; the page is shown instead, and
  // says so, with an explicit way through to the demonstration.
  if (mode === 'supabase' && status === 'signed_in') {
    const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
    return <Navigate to={from} replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    const { error } = await signIn(values.email, values.password)
    if (error) setSubmitError(error)
  })

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">AcademicOS</h1>
            <p className="text-sm text-muted-foreground">Internal academic operations</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Access is restricted to authorised members of the academic office team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === 'sample' ? (
              <div
                role="note"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-sample/40 bg-sample-muted px-3 py-2.5 text-sm"
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sample" aria-hidden />
                <p className="text-foreground/80">
                  <span className="font-medium text-sample">No backend is configured.</span>{' '}
                  There is nothing to sign in to yet. The application is running on local
                  demonstration data.
                </p>
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  {...register('email')}
                  aria-invalid={Boolean(formState.errors.email)}
                />
                {formState.errors.email ? (
                  <p className="text-xs text-destructive">{formState.errors.email.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                  aria-invalid={Boolean(formState.errors.password)}
                />
                {formState.errors.password ? (
                  <p className="text-xs text-destructive">{formState.errors.password.message}</p>
                ) : null}
              </div>

              {submitError || (status === 'suspended' && authError) ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError ?? authError}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={formState.isSubmitting || status === 'loading'}>
                <Lock /> {status === 'loading' ? 'Signing in…' : 'Sign in'}
              </Button>

              {mode === 'sample' ? (
                <Button type="button" variant="outline" className="w-full" asChild>
                  <Link to="/dashboard">Continue to the demonstration</Link>
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          There is no self-registration. Accounts are created by the Super Admin.
        </p>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, LoadingRows } from '@/components/common/states'
import type { AppRole } from '@/types/domain'
import { useAuth } from './auth-context'

/**
 * Route protection.
 *
 * This keeps unauthorised people out of the interface. It is not what keeps
 * them out of the data — Row Level Security does that, and would continue to
 * do it if every guard in this file were deleted.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="p-6">
        <LoadingRows rows={4} />
      </div>
    )
  }

  if (status === 'suspended' || status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <EmptyState
          icon={ShieldX}
          title={status === 'suspended' ? 'This account cannot be used' : 'Sign-in could not be completed'}
          description={error ?? 'Contact the Super Admin.'}
          action={
            <Button variant="outline" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (status !== 'signed_in') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

/**
 * Hides a route from roles that should not see it.
 *
 * A user who reaches the URL anyway sees this page rather than an empty one,
 * and if they bypassed it entirely the database would still return nothing.
 */
export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { role } = useAuth()

  if (role === null || !roles.includes(role)) {
    return (
      <div className="py-10">
        <EmptyState
          icon={ShieldX}
          title="You do not have access to this page"
          description="This area is restricted. If you believe you should have access, ask the Super Admin to review your role."
          action={
            <Button asChild>
              <Link to="/dashboard"><ArrowLeft /> Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return <>{children}</>
}

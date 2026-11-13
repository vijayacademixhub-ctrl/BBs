import { Link } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/states'

export function NotFoundPage() {
  return (
    <div className="py-10">
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        description="The page you requested does not exist, or has not been built yet."
        action={
          <Button asChild>
            <Link to="/dashboard"><ArrowLeft /> Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  )
}

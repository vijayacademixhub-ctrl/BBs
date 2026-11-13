import { Link } from 'react-router-dom'
import { ArrowLeft, Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'

/**
 * Placeholder for modules scheduled after Milestone 1.
 *
 * These routes are reachable so that the navigation structure can be
 * evaluated, but they state plainly that the feature is not built. They do
 * not simulate working functionality.
 */
export function PlannedPage({
  title,
  milestone,
  description,
  capabilities,
}: {
  title: string
  milestone: string
  description: string
  capabilities: string[]
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={`Scheduled for ${milestone}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/dashboard"><ArrowLeft /> Back to dashboard</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="size-4 text-warning" aria-hidden /> Not yet implemented
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm font-medium">Planned for this module</p>
          <ul className="space-y-1.5">
            {capabilities.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            The design and data model for this module are documented in docs/architecture.md.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

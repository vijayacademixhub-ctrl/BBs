import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FileWarning, Library } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelative } from '@/lib/format'
import type { RegisterHealth, Register } from '@/types/registry'
import { registerIcon } from '@/features/registry/icons'

/**
 * What the Master Index needs from whoever is reading the dashboard.
 *
 * Deliberately not a count of everything. A dashboard tile reading "412
 * records" tells nobody to do anything; the registers with something
 * outstanding, in order of how much, do.
 */
export function RegistryAttention({
  entries,
}: {
  entries: Array<{ register: Register; health: RegisterHealth }>
}) {
  const needing = entries
    .filter(({ health }) => health.overdue > 0 || health.incomplete > 0)
    .sort((a, b) =>
      b.health.overdue - a.health.overdue || b.health.incomplete - a.health.incomplete,
    )
    .slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Library className="size-4" /> Master Index
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {needing.length
                ? 'Registers with something outstanding.'
                : 'Nothing outstanding in any register.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/master-index">
              Open <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {needing.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Every record has an owner and nothing is past its date.
          </p>
        ) : (
          <ul className="space-y-1">
            {needing.map(({ register, health }) => {
              const Icon = registerIcon(register.icon)
              return (
                <li key={register.id}>
                  <Link
                    to={`/master-index/${register.slug}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{register.name}</p>
                      {health.lastUpdatedAt ? (
                        <p className="truncate text-xs text-muted-foreground">
                          Changed {formatRelative(health.lastUpdatedAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {health.overdue > 0 ? (
                        <Badge variant="destructive">
                          <AlertTriangle aria-hidden /> {health.overdue}
                        </Badge>
                      ) : null}
                      {health.incomplete > 0 ? (
                        <Badge variant="warning">
                          <FileWarning aria-hidden /> {health.incomplete}
                        </Badge>
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

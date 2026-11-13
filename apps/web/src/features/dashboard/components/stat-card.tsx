import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  to,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'warning' | 'destructive' | 'success'
  to?: string
  hint?: string
}) {
  const toneClass = {
    default: 'bg-accent text-accent-foreground',
    warning: 'bg-warning/12 text-warning',
    destructive: 'bg-destructive/12 text-destructive',
    success: 'bg-success/12 text-success',
  }[tone]

  const body = (
    <Card className={cn('p-4 transition-colors', to && 'hover:border-primary/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</p>
          {hint ? <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', toneClass)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
    </Card>
  )

  return to ? (
    <Link to={to} className="rounded-lg">
      {body}
    </Link>
  ) : (
    body
  )
}

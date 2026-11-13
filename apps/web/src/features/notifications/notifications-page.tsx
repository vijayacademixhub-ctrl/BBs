import { BellOff, CalendarDays, CheckSquare, FileText, Settings2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { SampleDataNotice } from '@/components/common/provenance'
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/states'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-data'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NotificationItem } from '@/types/domain'

const KIND_ICON: Record<NotificationItem['kind'], React.ComponentType<{ className?: string }>> = {
  meeting: CalendarDays,
  task: CheckSquare,
  verification: ShieldCheck,
  transcript: FileText,
  system: Settings2,
}

export function NotificationsPage() {
  const { data, isPending, isError, refetch } = useNotifications()
  const markRead = useMarkNotificationRead()

  return (
    <>
      <PageHeader title="Notifications" description="Meeting reminders, task changes and processing updates" />
      <SampleDataNotice />

      {isPending ? (
        <LoadingRows rows={5} />
      ) : isError ? (
        <ErrorState title="Notifications could not be loaded" onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications" description="You are up to date." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {data.map((item) => {
                const Icon = KIND_ICON[item.kind]
                return (
                  <li
                    key={item.id}
                    className={cn('flex items-start gap-3 px-4 py-3', !item.read && 'bg-accent/40')}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className={cn('text-sm', !item.read && 'font-medium')}>{item.title}</p>
                      {item.body ? <p className="text-sm text-muted-foreground">{item.body}</p> : null}
                      <p className="text-xs text-muted-foreground">{formatRelative(item.createdAt)}</p>
                    </div>
                    {!item.read ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => markRead.mutate(item.id)}
                        disabled={markRead.isPending}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

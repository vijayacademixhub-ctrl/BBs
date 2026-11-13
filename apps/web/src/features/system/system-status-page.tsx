import { CheckCircle2, CircleSlash, Database, Server, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/page-header'
import { useToast } from '@/components/common/toast'
import { resetSampleData } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

type Status = 'connected' | 'not_configured'

const SERVICES: { name: string; description: string; status: Status; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    name: 'Data platform (Supabase)',
    description: 'PostgreSQL, authentication, storage and realtime. Scheduled for Milestone 2.',
    status: 'not_configured',
    icon: Database,
  },
  {
    name: 'Transcription service (faster-whisper)',
    description: 'Speech to text for English, Kannada and Hindi. Scheduled for Milestone 4.',
    status: 'not_configured',
    icon: Server,
  },
  {
    name: 'Meeting analysis (Ollama / Qwen3)',
    description: 'Extraction of decisions and action items. Scheduled for Milestone 5.',
    status: 'not_configured',
    icon: Sparkles,
  },
]

export function SystemStatusPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  function handleReset() {
    resetSampleData()
    void queryClient.invalidateQueries()
    toast({ title: 'Sample data reset', description: 'All demonstration records restored to their original state.', tone: 'success' })
  }

  return (
    <>
      <PageHeader
        title="System status"
        description="Connection state of each backing service"
        actions={<Button variant="outline" onClick={handleReset}>Reset sample data</Button>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <CardDescription>
            No API credentials are configured. Nothing here is simulated — a service reports as connected only when it
            genuinely is.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {SERVICES.map((service) => {
              const Icon = service.icon
              return (
                <li key={service.name} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  </div>
                  <Badge variant={service.status === 'connected' ? 'success' : 'outline'} className="shrink-0">
                    {service.status === 'connected' ? (
                      <><CheckCircle2 aria-hidden /> Connected</>
                    ) : (
                      <><CircleSlash aria-hidden /> Not configured</>
                    )}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current data source</CardTitle>
          <CardDescription>Milestone 1 runs on local demonstration data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Records are held in the browser's local storage and are specific to this device. They are not shared with
            anyone, are not backed up, and do not constitute an institutional record.
          </p>
          <p>
            When the data platform is connected at Milestone 2, this store is replaced and the demonstration records
            are discarded.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

import { FlaskConical, Sparkles, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Provenance marking.
 *
 * Milestone 1 runs entirely on demonstration data, and the AI pipeline is not
 * connected. The brief requires — and decision 7 confirms — that sample
 * content is never presented as a genuine institutional record, and that AI
 * output is never shown as if it had been verified. These components are the
 * single mechanism for that, so the marking cannot drift between screens.
 */

export type Provenance = 'sample' | 'ai_unverified' | 'verified'

export function ProvenanceBadge({ provenance, className }: { provenance: Provenance; className?: string }) {
  if (provenance === 'sample') {
    return (
      <Badge variant="sample" className={className}>
        <FlaskConical aria-hidden /> Sample data
      </Badge>
    )
  }
  if (provenance === 'ai_unverified') {
    return (
      <Badge variant="ai" className={className}>
        <Sparkles aria-hidden /> AI — unverified
      </Badge>
    )
  }
  return (
    <Badge variant="success" className={className}>
      <ShieldCheck aria-hidden /> Verified
    </Badge>
  )
}

/**
 * Page-level notice. Shown on every screen while the application is running
 * on demonstration data so that the state is never ambiguous.
 */
export function SampleDataNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-sample/40 bg-sample-muted px-3 py-2.5 text-sm',
        className,
      )}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-sample" aria-hidden />
      <p className="text-foreground/80">
        <span className="font-medium text-sample">Demonstration data.</span>{' '}
        Everything below is sample content for interface development. It is not an institutional record, and no AI
        processing has taken place.
      </p>
    </div>
  )
}

import * as React from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; title: string; description?: string; tone: ToastTone }

const ToastContext = React.createContext<{
  toast: (t: Omit<Toast, 'id'> | string) => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const nextId = React.useRef(0)

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (input: Omit<Toast, 'id'> | string) => {
      const id = nextId.current++
      const next: Toast = typeof input === 'string' ? { id, title: input, tone: 'info' } : { id, ...input }
      setToasts((current) => [...current, next])
      window.setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-card p-3 shadow-lg',
                t.tone === 'success' && 'border-success/40',
                t.tone === 'error' && 'border-destructive/40',
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  t.tone === 'success' && 'text-success',
                  t.tone === 'error' && 'text-destructive',
                  t.tone === 'info' && 'text-info',
                )}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description ? <p className="text-sm text-muted-foreground">{t.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-4" />
                <span className="sr-only">Dismiss</span>
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

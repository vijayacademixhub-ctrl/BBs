import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ToastProvider } from '@/components/common/toast'
import { AuthProvider } from '@/features/auth/auth-context'

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // A permission failure will not succeed on a second attempt,
              // and retrying one wastes time and muddies the error shown.
              const message = error instanceof Error ? error.message : ''
              if (/permission|row-level security|not have access|JWT/i.test(message)) return false
              return failureCount < 1
            },
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

import { useQuery } from '@tanstack/react-query'
import { fetchServiceStatus, UNCONFIGURED, type ServiceStatus } from '@/lib/capture/service'

/**
 * What this deployment is configured to do.
 *
 * Asked once and cached for the session: the answer changes only when
 * someone edits the deployment's environment, which takes effect on the next
 * deployment anyway. Until the answer arrives, nothing is claimed to be
 * configured, so no screen briefly offers a button that would fail.
 */
export function useServiceStatus(): { status: ServiceStatus; isPending: boolean } {
  const query = useQuery({
    queryKey: ['service-status'],
    queryFn: fetchServiceStatus,
    staleTime: Infinity,
    retry: false,
  })

  return { status: query.data ?? UNCONFIGURED, isPending: query.isPending }
}

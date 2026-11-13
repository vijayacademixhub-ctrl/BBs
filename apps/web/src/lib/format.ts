import { format, formatDistanceToNow, isPast, isToday, isTomorrow, parseISO } from 'date-fns'

export function formatTime(iso: string): string {
  return format(parseISO(iso), 'h:mm a')
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy')
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy 'at' h:mm a")
}

export function formatLongDate(date: Date = new Date()): string {
  return format(date, 'EEEE, d MMMM yyyy')
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true })
}

/** "Today", "Tomorrow", or a formatted date. Used for due dates and agendas. */
export function describeDay(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'd MMM')
}

export function isOverdue(dateOnly: string | undefined): boolean {
  if (!dateOnly) return false
  const d = parseISO(`${dateOnly}T23:59:59`)
  return isPast(d)
}

export function isDueToday(dateOnly: string | undefined): boolean {
  if (!dateOnly) return false
  return isToday(parseISO(`${dateOnly}T12:00:00`))
}

export function todayISODate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

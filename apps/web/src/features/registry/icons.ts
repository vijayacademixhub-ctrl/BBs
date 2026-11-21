import {
  BookOpen, Briefcase, Building2, CalendarDays, ClipboardList, Database, FileText,
  FolderOpen, GraduationCap, Landmark, Map, Table2, Users, Wallet,
} from 'lucide-react'

/**
 * Icons a register may carry.
 *
 * A register stores the *name* of its icon, not a component, because a
 * register is data: it can be created by someone using the application and
 * has to survive being written to a database and read back. The names are
 * fixed here so an unknown value falls back to a table rather than breaking
 * the page.
 */
export const REGISTER_ICONS = {
  folder: FolderOpen,
  clipboard: ClipboardList,
  calendar: CalendarDays,
  map: Map,
  graduation: GraduationCap,
  table: Table2,
  file: FileText,
  people: Users,
  book: BookOpen,
  finance: Wallet,
  institution: Landmark,
  department: Building2,
  work: Briefcase,
  data: Database,
} as const

export type RegisterIconName = keyof typeof REGISTER_ICONS

export function registerIcon(name: string) {
  return REGISTER_ICONS[name as RegisterIconName] ?? Table2
}

export const ICON_CHOICES: Array<{ value: RegisterIconName; label: string }> = [
  { value: 'folder', label: 'Folder' },
  { value: 'clipboard', label: 'Clipboard' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'map', label: 'Map' },
  { value: 'graduation', label: 'Academic' },
  { value: 'table', label: 'Table' },
  { value: 'file', label: 'Document' },
  { value: 'people', label: 'People' },
  { value: 'book', label: 'Book' },
  { value: 'finance', label: 'Finance' },
  { value: 'institution', label: 'Institution' },
  { value: 'department', label: 'Department' },
  { value: 'work', label: 'Work' },
  { value: 'data', label: 'Data' },
]

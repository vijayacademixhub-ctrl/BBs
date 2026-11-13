import {
  BarChart3, Bell, CalendarDays, CheckSquare, ClipboardList, Cpu, LayoutDashboard,
  Mic, MessageSquareText, ShieldCheck, Users, FileText, Settings,
} from 'lucide-react'
import type { AppRole } from '@/types/domain'

export interface NavItem {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  roles?: AppRole[]
  /** Not yet implemented — shown but marked, rather than hidden. */
  planned?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Navigation hierarchy from docs/architecture.md §2.3.
 *
 * Milestones beyond M1 are listed with `planned: true` rather than omitted,
 * so the intended scope of the platform is visible without the interface
 * pretending the feature already works.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Meetings',
    items: [
      { label: 'Meetings', to: '/meetings', icon: CalendarDays },
      { label: 'Recorder', to: '/recorder', icon: Mic, planned: true },
      { label: 'Transcripts', to: '/transcripts', icon: FileText, planned: true },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Tasks', to: '/tasks', icon: CheckSquare },
      { label: 'Daily Work', to: '/daily-work', icon: ClipboardList },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays, planned: true },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Verification', to: '/verification', icon: ShieldCheck, roles: ['super_admin', 'coordinator'], planned: true },
      { label: 'Assistant', to: '/assistant', icon: MessageSquareText, planned: true },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Team', to: '/admin/users', icon: Users, roles: ['super_admin'], planned: true },
      { label: 'Reports', to: '/admin/reports', icon: BarChart3, roles: ['super_admin', 'coordinator'], planned: true },
      { label: 'System Status', to: '/admin/system', icon: Cpu, roles: ['super_admin'] },
    ],
  },
]

export const SECONDARY_NAV: NavItem[] = [
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Settings', to: '/settings', icon: Settings },
]

export function visibleGroups(role: AppRole | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role))),
  })).filter((group) => group.items.length > 0)
}

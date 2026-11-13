import { NavLink } from 'react-router-dom'
import { GraduationCap, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/use-data'
import { SECONDARY_NAV, visibleGroups, type NavItem } from './nav-config'

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
          'text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground',
          isActive && 'bg-white/10 font-medium text-sidebar-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-4 shrink-0', isActive ? 'text-sidebar-accent' : 'text-sidebar-muted')} />
          <span className="truncate">{item.label}</span>
          {item.planned ? (
            <span className="ml-auto rounded border border-sidebar-border px-1 py-px text-2xs uppercase tracking-wide text-sidebar-muted">
              Soon
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: user } = useCurrentUser()
  const groups = visibleGroups(user?.role)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent/20 text-sidebar-accent">
          <GraduationCap className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">AcademicOS</p>
          <p className="truncate text-2xs text-sidebar-muted">Academic operations</p>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-2.5 text-2xs font-semibold uppercase tracking-wider text-sidebar-muted">{group.label}</p>
            {group.items.map((item) => (
              <NavRow key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-sidebar-border px-3 py-3">
        {SECONDARY_NAV.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
        <div className="px-2.5 pt-2">
          <Badge variant="sample" className="w-full justify-center">Sample data · M1</Badge>
        </div>
      </div>
    </div>
  )
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
      />
      <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-xl animate-in slide-in-from-left duration-200">
        <SidebarContent onNavigate={onClose} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-2 top-2 text-sidebar-foreground hover:bg-white/10"
        >
          <X />
          <span className="sr-only">Close navigation</span>
        </Button>
      </div>
    </div>
  )
}

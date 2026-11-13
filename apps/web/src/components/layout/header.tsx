import { Link, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, Moon, Settings, Sun, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications } from '@/hooks/use-data'
import { useAuth } from '@/features/auth/auth-context'
import { initialsOf } from '@/lib/format'
import { useTheme } from '@/hooks/use-theme'

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  coordinator: 'Coordinator',
  member: 'Team Member',
} as const

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const { profile: user, mode, signOut } = useAuth()
  const { data: notifications } = useNotifications()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const unread = (notifications ?? []).filter((n) => !n.read).length

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenNav}>
        <Menu />
        <span className="sr-only">Open navigation</span>
      </Button>

      <div className="min-w-0 flex-1" />

      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle colour theme">
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <Button variant="ghost" size="icon" asChild className="relative">
        <Link to="/notifications" aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 transition-colors hover:bg-muted"
          >
            <Avatar>
              <AvatarFallback>{user ? initialsOf(user.fullName) : '··'}</AvatarFallback>
            </Avatar>
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block truncate text-sm font-medium leading-tight">{user?.fullName ?? 'Loading…'}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {user ? ROLE_LABEL[user.role] : ''}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{user?.email ?? ''}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings"><UserRound /> Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings"><Settings /> Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={mode === 'sample'}
            onSelect={() => {
              void signOut().then(() => navigate('/login'))
            }}
          >
            <LogOut />{' '}
            {mode === 'sample' ? 'Sign out — no backend configured' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

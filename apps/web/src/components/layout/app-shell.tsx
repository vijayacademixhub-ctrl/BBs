import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './header'
import { MobileSidebar, SidebarContent } from './sidebar'

/**
 * Application shell.
 *
 * Desktop (lg and above) shows a fixed sidebar; below that the sidebar
 * becomes a slide-over opened from the header. The main region is the only
 * scrolling area, which keeps the header and sidebar stable on mobile where
 * browser chrome otherwise causes the viewport to shift.
 */
export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
        <SidebarContent />
      </aside>

      <MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setNavOpen(true)} />
        <main
          key={location.pathname}
          className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

import { Link, Outlet } from 'react-router-dom'
import { Moon, Sun, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

/**
 * The shell for a register opened in its own window.
 *
 * No sidebar and no application navigation: this window exists to hold one
 * register beside whatever else the person is working in, and a navigation
 * tree would invite them to wander out of it into a window with no way back.
 *
 * What it does keep is the theme control and a link into the full
 * application, which opens in the main window rather than taking this one
 * over.
 */
export function RegisterWindowShell() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Table2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">Master Index</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            · separate window
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="sr-only">Switch theme</span>
          </Button>
          <Button variant="outline" size="sm" asChild>
            {/* target=_blank, so the main application does not replace this
                window — which would leave the person with no register and no
                way back to it. */}
            <Link to="/dashboard" target="_blank" rel="noopener">
              Full application
            </Link>
          </Button>
        </div>
      </header>

      <main className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-4 sm:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

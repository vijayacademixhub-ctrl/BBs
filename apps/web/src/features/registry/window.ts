/**
 * Opening a register in its own window.
 *
 * The request was a separate window, and this is the literal thing: a real
 * operating-system window holding one register, which can sit beside a
 * meeting, a spreadsheet or a browser on another screen. It is not a modal
 * and not a second tab.
 *
 * Two constraints shape the implementation.
 *
 * A pop-up carries no application state, so the window is addressed by URL —
 * which is why the standalone route exists and why the register is identified
 * by its slug rather than by its id.
 *
 * A standalone build using the in-memory router has no real URLs, so a second
 * window could not be told what to show. `canOpenWindow` reports that
 * honestly and the button explains itself rather than opening something
 * broken.
 */

export const STANDALONE_PREFIX = '/w/master-index'

export function canOpenWindow(): boolean {
  if (typeof window === 'undefined') return false
  return (import.meta.env.VITE_ROUTER as string | undefined) !== 'memory'
}

export function standalonePath(slug?: string): string {
  return slug ? `${STANDALONE_PREFIX}/${slug}` : STANDALONE_PREFIX
}

/**
 * Opens, or re-focuses, the window for one register.
 *
 * The window is named after the register, so asking twice brings the existing
 * window forward instead of opening a second copy of the same index — which
 * would be two editable views of one record, side by side.
 */
export function openRegisterWindow(slug: string): Window | null {
  if (!canOpenWindow()) return null

  const url = new URL(standalonePath(slug), window.location.origin).toString()
  const features = 'popup=yes,width=1280,height=880,menubar=no,toolbar=no,location=no'
  const opened = window.open(url, `academicos-register-${slug}`, features)
  opened?.focus()
  return opened
}

/** True when this document is itself a register window. */
export function isStandaloneWindow(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith(STANDALONE_PREFIX)
}

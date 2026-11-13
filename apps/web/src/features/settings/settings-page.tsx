import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/common/page-header'
import { LoadingRows } from '@/components/common/states'
import { useAuth } from '@/features/auth/auth-context'
import { useTheme } from '@/hooks/use-theme'
import { initialsOf } from '@/lib/format'

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  coordinator: 'Coordinator',
  member: 'Team Member',
} as const

export function SettingsPage() {
  const { profile: user, status } = useAuth()
  const isPending = status === 'loading'
  const { theme, toggle } = useTheme()

  return (
    <>
      <PageHeader title="Settings" description="Profile and application preferences" />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Profile editing is enabled once authentication is connected at Milestone 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending || !user ? (
            <LoadingRows rows={2} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarFallback className="text-base">{initialsOf(user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.fullName}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.designation}</p>
                </div>
                <Badge variant="secondary" className="ml-auto shrink-0">{ROLE_LABEL[user.role]}</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-name">Full name</Label>
                  <Input id="settings-name" defaultValue={user.fullName} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input id="settings-email" defaultValue={user.email} disabled />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>The theme preference is stored on this device.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm">
            Current theme: <span className="font-medium">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </p>
          <Button variant="outline" onClick={toggle}>
            Switch to {theme === 'dark' ? 'light' : 'dark'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>Configurable once the notification service is built at Milestone 8.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            In-app notifications are shown by default. Email and push delivery will be added with per-category
            preferences.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

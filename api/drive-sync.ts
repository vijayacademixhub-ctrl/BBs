import { createSign } from 'node:crypto'

/**
 * Refreshes the Document Master Index from Google Drive.
 *
 * The register stores a Drive link per document, and "Last updated" has been
 * maintained by hand — which is how an index goes stale. This reads the
 * modified date, the owner and the current name of each linked file or
 * folder and writes them back.
 *
 * What it will not do is overwrite what a person wrote. Only three fields
 * are touched, and only with what Drive actually reports: the last-updated
 * date, a Drive-reported name recorded in its own column, and an owner where
 * the register has none. The document's own name, its status and its remarks
 * are the team's, and are left alone — an index that silently rewrites
 * itself from another system is worse than one that is a week out of date.
 *
 * Credentials are the same service account as the calendar, with Drive's
 * read-only scope added. It needs no new key: the folders are shared with
 * the service account's address exactly as they would be with a colleague,
 * and it can see nothing that has not been shared with it.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly'

interface Row {
  id: string
  values: Record<string, string>
}

export async function POST(request: Request): Promise<Response> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY

  if (!email || !privateKey) {
    return json(
      {
        error: 'not_configured',
        message:
          'No Google service account is set on this deployment. Drive synchronisation needs ' +
          'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY, and the folders must be shared ' +
          'with that address. See docs/google-workspace-setup.md.',
      },
      503,
    )
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'not_configured', message: 'No Supabase project is configured.' }, 503)
  }

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'unauthenticated', message: 'Sign in before synchronising.' }, 401)
  }

  // Reads and writes as the caller, so this cannot touch a register they
  // could not edit in the interface.
  const headers = {
    apikey: supabaseKey,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
  const rest = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    })
    if (!response.ok) {
      throw new Error(`${response.status} on ${path}: ${(await response.text().catch(() => '')).slice(0, 200)}`)
    }
    return response
  }

  try {
    const registers = (await (
      await rest('registers?select=id&slug=eq.documents&limit=1')
    ).json()) as Array<{ id: string }>

    if (registers.length === 0) {
      return json(
        { error: 'no_register', message: 'There is no Document Master Index to refresh.' },
        404,
      )
    }

    const rows = (await (
      await rest(
        `register_records?select=id,values&register_id=eq.${registers[0]!.id}&archived_at=is.null`,
      )
    ).json()) as Row[]

    const accessToken = await serviceAccountToken(email, privateKey)

    let checked = 0
    let updated = 0
    let unreachable = 0
    const problems: string[] = []

    for (const row of rows) {
      const fileId = driveIdFrom(row.values.driveLink ?? '')
      if (!fileId) continue
      checked += 1

      const file = await driveFile(accessToken, fileId)
      if (!file) {
        unreachable += 1
        // Worth reporting rather than swallowing: a link that no longer
        // resolves is exactly what an index is supposed to catch.
        if (problems.length < 12) {
          problems.push(row.values.name ?? fileId)
        }
        continue
      }

      const patch: Record<string, string> = {}
      const modified = file.modifiedTime?.slice(0, 10)
      if (modified && modified !== row.values.lastUpdated) patch.lastUpdated = modified
      if (file.name && file.name !== row.values.driveName) patch.driveName = file.name

      const owner = file.owners?.[0]?.displayName ?? file.owners?.[0]?.emailAddress
      if (owner && !String(row.values.owner ?? '').trim()) patch.owner = owner

      if (Object.keys(patch).length === 0) continue

      await rest(`register_records?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ values: { ...row.values, ...patch } }),
      })
      updated += 1
    }

    return json({ checked, updated, unreachable, problems })
  } catch (error) {
    return json(
      {
        error: 'sync_failed',
        message: 'The Drive synchronisation did not finish.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }
}

interface DriveFile {
  name?: string
  modifiedTime?: string
  owners?: Array<{ displayName?: string; emailAddress?: string }>
}

async function driveFile(accessToken: string, fileId: string): Promise<DriveFile | null> {
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    '?fields=name,modifiedTime,owners(displayName,emailAddress)&supportsAllDrives=true'

  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  // 404 and 403 both mean "not shared with the service account" as far as
  // this is concerned, and neither should stop the rest of the run.
  if (!response.ok) return null
  return (await response.json()) as DriveFile
}

/**
 * Drive ids appear in several link shapes, and the folder links in this
 * index use two of them. Anything unrecognised is skipped rather than
 * guessed at.
 */
function driveIdFrom(link: string): string | null {
  if (!link) return null
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]{10,})/,
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(link)
    if (match) return match[1]!
  }
  return null
}

async function serviceAccountToken(email: string, privateKey: string): Promise<string> {
  const pem = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey
  const now = Math.floor(Date.now() / 1000)

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  ).toString('base64url')

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const assertion = `${header}.${claims}.${signer.sign(pem).toString('base64url')}`

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) {
    throw new Error(
      'The service account could not be authenticated for Drive. Check the key, and that the ' +
        'Drive API is enabled for the project.',
    )
  }

  const body = (await response.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('The token response carried no access token.')
  return body.access_token
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

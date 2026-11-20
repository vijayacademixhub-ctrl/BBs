import { BUILT_IN_REGISTERS } from '../workbook/registers.js'
import { REGISTER_SEED_RECORDS } from '../workbook/seed.js'

/**
 * Loads the Master Index workbook into the database, from the server.
 *
 * This used to run in the browser, which meant the workbook — staff names,
 * allocations, Drive folder links — was compiled into the published bundle
 * and readable by anyone who opened the site, signed in or not. Moving the
 * import here is the fix: the seed is imported only by this function, which
 * never ships to a browser.
 *
 * It writes as the caller, not as an administrator. The request carries the
 * user's own access token and this forwards it to PostgREST, so Row Level
 * Security applies exactly as it would to anything that user did in the
 * interface. A service-role key would have been less code and would have let
 * this endpoint write anything into anyone's team; it is deliberately not
 * used.
 */

interface SupabaseConfig {
  url: string
  key: string
}

function config(): SupabaseConfig | null {
  // The VITE_ copies exist because the browser build needs them; on the
  // server they are ordinary variables. Either name is accepted so the
  // deployment needs only one pair.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  return url && key ? { url, key } : null
}

export async function POST(request: Request): Promise<Response> {
  const supabase = config()
  if (!supabase) {
    return json(
      { error: 'not_configured', message: 'No Supabase project is configured on this deployment.' },
      503,
    )
  }

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'unauthenticated', message: 'Sign in before importing.' }, 401)
  }

  const headers = {
    apikey: supabase.key,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }

  const rest = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`${response.status} on ${path}: ${detail}`)
    }
    return response
  }

  try {
    // The caller's team, read through their own policies — so this cannot be
    // pointed at a team they are not in.
    const membership = (await (
      await rest('team_members?select=team_id,profile_id&limit=1')
    ).json()) as Array<{ team_id: string; profile_id: string }>

    if (membership.length === 0) {
      return json(
        { error: 'no_team', message: 'This account is not a member of any team.' },
        403,
      )
    }
    const { team_id: teamId, profile_id: profileId } = membership[0]!

    const existing = (await (await rest('registers?select=slug')).json()) as Array<{ slug: string }>
    const have = new Set(existing.map((r) => r.slug))

    let registersCreated = 0
    let recordsCreated = 0

    for (const definition of BUILT_IN_REGISTERS) {
      if (have.has(definition.slug)) continue

      const created = (await (
        await rest('registers?select=id', {
          method: 'POST',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify({
            team_id: teamId,
            slug: definition.slug,
            name: definition.name,
            description: definition.description,
            group_name: definition.group,
            icon: definition.icon,
            title_field_id: definition.titleFieldId,
            status_field_id: definition.statusFieldId ?? null,
            owner_field_id: definition.ownerFieldId ?? null,
            due_field_id: definition.dueFieldId ?? null,
            updated_field_id: definition.updatedFieldId ?? null,
            done_values: definition.doneValues ?? [],
            // The insert policy refuses built_in from a browser session, and
            // this writes as the browser. An administrator marks the imported
            // registers protected afterwards; see docs/accounts-and-access.md.
            built_in: false,
            created_by: profileId,
          }),
        })
      ).json()) as Array<{ id: string }>

      const registerId = created[0]!.id
      registersCreated += 1

      await rest('register_fields', {
        method: 'POST',
        body: JSON.stringify(
          definition.fields.map((field, index) => ({
            register_id: registerId,
            field_key: field.id,
            label: field.label,
            kind: field.kind,
            options: field.options ?? [],
            in_grid: field.inGrid ?? true,
            help: field.help ?? '',
            built_in: true,
            position: index,
          })),
        ),
      })

      const rows = REGISTER_SEED_RECORDS[definition.slug] ?? []
      if (rows.length > 0) {
        await rest('register_records', {
          method: 'POST',
          body: JSON.stringify(
            rows.map((row) => ({
              register_id: registerId,
              values: row.values,
              created_by: profileId,
              updated_by: profileId,
            })),
          ),
        })
        recordsCreated += rows.length
      }
    }

    return json({ registers: registersCreated, records: recordsCreated })
  } catch (error) {
    return json(
      {
        error: 'import_failed',
        message: 'The workbook could not be imported.',
        detail: error instanceof Error ? error.message : undefined,
      },
      502,
    )
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

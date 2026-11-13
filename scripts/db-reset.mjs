/**
 * Rebuilds the local development database from the migration files.
 *
 * Applies the test harness shim first, then every migration in order. Used
 * for local work without Docker; `supabase db reset` is the equivalent when
 * the CLI and Docker are available, and is what should be used where they are.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const connectionString =
  process.env.ACADEMICOS_TEST_DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5432/academicos_test'

const files = [
  join(root, 'supabase/tests/harness/10_reset.sql'),
  join(root, 'supabase/tests/harness/00_supabase_shim.sql'),
  ...readdirSync(join(root, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(root, 'supabase/migrations', f)),
]

const client = new pg.Client({ connectionString })
await client.connect()
for (const file of files) {
  process.stdout.write(`applying ${file.replace(root + '/', '')} … `)
  await client.query(readFileSync(file, 'utf8'))
  console.log('ok')
}
await client.end()
console.log('\nSchema rebuilt. No seed data was loaded.')

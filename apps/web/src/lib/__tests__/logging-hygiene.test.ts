import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Static checks on the source itself.
 *
 * Unit tests can show that the redaction helpers work. They cannot show that
 * everyone used them. These assertions read the source and fail if a rule has
 * been broken anywhere, which is the only way a property like "we never log a
 * signed URL" can actually hold across a codebase.
 */

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'test') continue
      sourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

const files = sourceFiles(srcDir)

describe('logging hygiene', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('never calls console directly outside the logger', () => {
    // console.log(someObject) is how a signed URL or a session ends up in a
    // browser console, and from there in a screenshot or a bug report. The
    // logger redacts; direct calls do not.
    const offenders = files
      .filter((file) => !file.endsWith(join('lib', 'logger.ts')))
      .filter((file) => /\bconsole\s*\.\s*(log|info|warn|error|debug|table|dir)\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })

  it('never writes a signed URL into browser storage', () => {
    // localStorage survives the signature's lifetime and is readable by any
    // script on the origin.
    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return /(localStorage|sessionStorage)\.setItem\([^)]*(signed|signedUrl|token)/i.test(text)
      })
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })

  it('mints signed URLs in exactly one module', () => {
    // Keeping this in one place is what makes the short lifetime and the
    // audit entry unavoidable rather than conventional.
    const offenders = files
      .filter((file) => !file.endsWith(join('lib', 'supabase', 'storage.ts')))
      .filter((file) => /createSignedUrls?\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })

  it('never imports a Node module into browser code', () => {
    // Node types are enabled for the test files in this package, which means
    // `fs` and `process` would also type-check inside application code. They
    // do not exist in a browser, so an import would fail at runtime rather
    // than at build time. This keeps that from happening quietly.
    const offenders = files
      .filter((file) => /from\s+['"]node:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })

  it('reads the service-role key nowhere in the browser bundle', () => {
    // Vite inlines every VITE_ variable into the published JavaScript. A
    // service-role key there would be published to anyone who opens the site.
    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return /SERVICE_ROLE|service_role_key|VITE_SUPABASE_SERVICE/i.test(text)
          // The client module names the string in a guard that throws if such
          // a key is configured, which is the opposite of using one.
          && !file.endsWith(join('lib', 'supabase', 'client.ts'))
      })
      .map((file) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })
})

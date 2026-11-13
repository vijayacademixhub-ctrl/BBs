/**
 * Builds a single self-contained HTML file.
 *
 * The application normally ships as an index.html plus hashed asset files,
 * served by a host that rewrites unknown paths to index.html. A static host
 * that does neither needs one file: all CSS and JS inlined, no code
 * splitting, and routing held in memory.
 *
 * Output: dist-standalone/academicos.html
 */
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(web, 'dist-standalone')

rmSync(out, { recursive: true, force: true })

await build({
  root: web,
  configFile: false,
  plugins: [react()],
  resolve: { alias: { '@': join(web, 'src') } },
  define: { 'import.meta.env.VITE_ROUTER': JSON.stringify('memory') },
  build: {
    outDir: out,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    rollupOptions: {
      // One JS file: an inlined script cannot resolve further chunks.
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
})

const js = readFileSync(join(out, 'app.js'), 'utf8')
const css = readFileSync(join(out, 'app.css'), 'utf8')

// No doctype, html, head or body: the host supplies those.
const page = `<title>AcademicOS</title>
<style>
${css}
/* The host pads :root for the phone's safe areas, so the shell measures
   itself against that padded box rather than the raw viewport. */
#root { height: 100%; }
</style>
<div id="root" style="height:100%"></div>
<script type="module">
${js}
</script>
`

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'academicos.html'), page)

const kb = (n) => `${Math.round(n / 1024)} kB`
console.log(`\nStandalone build: dist-standalone/academicos.html  ${kb(Buffer.byteLength(page))}`)
console.log(`  css ${kb(css.length)}   js ${kb(js.length)}`)

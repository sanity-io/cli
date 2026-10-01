/**
 * Bundles `create-sanity` into a single dependency-free file, plus the
 * Studio templates, so `npm create sanity` downloads one small package.
 */
import {cp, readFile, rm} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {build} from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const cliRoot = join(root, '..', '@sanity', 'cli')
const cliPkg = JSON.parse(await readFile(join(cliRoot, 'package.json'), 'utf8'))

await rm(join(root, 'dist'), {force: true, recursive: true})
await build({
  // Some bundled dependencies are CommonJS and `require()` Node builtins
  banner: {
    js: "import {createRequire as __createRequire} from 'node:module';const require = __createRequire(import.meta.url);",
  },
  bundle: true,
  define: {__SANITY_CLI_VERSION__: JSON.stringify(cliPkg.version)},
  entryPoints: [join(root, 'src', 'index.ts')],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'warning',
  metafile: Boolean(process.env.CREATE_SANITY_METAFILE),
  minify: true,
  outfile: join(root, 'dist', 'index.js'),
  platform: 'node',
  target: 'node22.12',
}).then(async (result) => {
  if (result.metafile) {
    const {writeFile} = await import('node:fs/promises')
    await writeFile(join(root, 'dist', 'meta.json'), JSON.stringify(result.metafile))
  }
})
await cp(join(cliRoot, 'templates'), join(root, 'dist', 'templates'), {recursive: true})

import {access, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {build, type Plugin} from 'esbuild'
import {moduleResolve} from 'import-meta-resolve'
import {loadEnv} from 'vite'

import {subdebug} from '../../debug.js'
import {getStudioEnvironmentVariables} from '../../util/environment/getStudioEnvironmentVariables.js'
import {resolveLocalPackagePath} from '../../util/resolveLocalPackage.js'

const debug = subdebug('worker:bundleStudioConfig')

const ASSET_REGEX = /\.(css|scss|sass|less|png|jpe?g|gif|svg|woff2?|ttf|eot|otf)(\?.*)?$/
const STUB_NAMESPACE = 'sanity-stub-asset'
const HTTPS_NAMESPACE = 'sanity-https'

const stubAssetsPlugin: Plugin = {
  name: 'sanity:stub-assets',
  setup(build) {
    build.onResolve({filter: ASSET_REGEX}, (args) => ({
      namespace: STUB_NAMESPACE,
      path: args.path,
    }))
    build.onLoad({filter: /.*/, namespace: STUB_NAMESPACE}, () => ({
      contents: 'export default {}',
      loader: 'js',
    }))
  },
}

/**
 * The synthetic entry imports things like `rxjs`, `@sanity/client`, `@sanity/ui`
 * that may not be directly resolvable from the user's `package.json` under pnpm
 * strict mode (they're sanity's peer deps, not the studio's own). Try the
 * default resolver first, fall back to resolving from sanity's location.
 *
 * Scoped to imports originating in the synthetic entry — transitive bare
 * specifiers inside the dep graph already resolve fine via the default
 * resolver, and intercepting them all is expensive (~2s on a 15MB graph).
 */
function peerFallbackPlugin(sanityUrl: URL, syntheticEntryName: string): Plugin {
  return {
    name: 'sanity:peer-fallback-resolver',
    setup(build) {
      build.onResolve({filter: /^[^./]/}, async (args) => {
        if (args.path.startsWith('node:')) return null
        if (args.pluginData?.sanityFallback) return null
        // Only intercept direct imports from the synthetic entry.
        if (!args.importer.endsWith(syntheticEntryName)) return null

        const primary = await build.resolve(args.path, {
          importer: args.importer,
          kind: args.kind,
          pluginData: {sanityFallback: true},
          resolveDir: args.resolveDir,
        })
        if (primary.errors.length === 0) return primary

        try {
          const resolved = moduleResolve(args.path, sanityUrl)
          return {path: fileURLToPath(resolved)}
        } catch {
          // Let esbuild surface the original (more useful) error.
          return null
        }
      })
    },
  }
}

/**
 * Fetches `https://` imports at bundle time and inlines their contents. Mirrors
 * the behavior of vite-node's HTTP module loader so studios that import from
 * URLs (e.g. https://themer.sanity.build/...) keep working.
 */
function httpsImportsPlugin(): Plugin {
  const cache = new Map<string, string>()
  return {
    name: 'sanity:https-imports',
    setup(build) {
      build.onResolve({filter: /^https:\/\//}, (args) => ({
        namespace: HTTPS_NAMESPACE,
        path: args.path,
      }))
      // Relative imports from inside a fetched module → resolve against its URL
      build.onResolve({filter: /^\.{1,2}\//, namespace: HTTPS_NAMESPACE}, (args) => ({
        namespace: HTTPS_NAMESPACE,
        path: new URL(args.path, args.importer).href,
      }))
      build.onLoad({filter: /.*/, namespace: HTTPS_NAMESPACE}, async (args) => {
        let code = cache.get(args.path)
        if (code === undefined) {
          debug('Fetching HTTPS import: %s', args.path)
          const res = await fetch(args.path, {signal: AbortSignal.timeout(30_000)})
          if (!res.ok) {
            throw new Error(
              `Failed to fetch module from ${args.path}: ${res.status} ${res.statusText}`,
            )
          }
          code = await res.text()
          cache.set(args.path, code)
        }
        return {contents: code, loader: 'js'}
      })
    },
  }
}

const SYNTHETIC_ENTRY_NAME = '__sanity-manifest-entry.js'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

interface BundleStudioConfigOptions {
  configPath: string
  workDir: string
}

/**
 * Bundles a studio config + the resolveConfig pipeline into a single ESM file
 * via esbuild. Replaces the per-module vite-node SSR transform that previously
 * dominated the time spent in `getStudioWorkspaces`.
 *
 * The bundle exports `loadWorkspaces()` which returns the resolved Workspace[]
 * with auth stubbed, identical to what vite-node was producing.
 *
 * @internal
 */
export async function bundleStudioConfig({
  configPath,
  workDir,
}: BundleStudioConfigOptions): Promise<string> {
  const cacheDir = join(workDir, 'node_modules', '.sanity-cli-cache')
  await mkdir(cacheDir, {recursive: true})

  // sanity's location is the fallback resolve root used by `peerFallbackPlugin`
  // when the user's workDir can't resolve a bare specifier (typical under pnpm
  // strict mode for sanity's peer deps like `rxjs`, `@sanity/client`, etc.).
  const sanityUrl = resolveLocalPackagePath('sanity', workDir)

  // Load `.env` files into process.env so studio code can read SANITY_STUDIO_* vars
  // declared there. Mirrors what vite-node's loader does via vite's `loadEnv`.
  const envFromDotenv = loadEnv('development', workDir, '')
  for (const key of Object.keys(envFromDotenv)) {
    if (process.env[key] === undefined) process.env[key] = envFromDotenv[key]
  }

  // Inject SANITY_STUDIO_* env vars as compile-time constants, mirroring what the
  // vite-node loader (and Vite itself) does. Studios reference these via both
  // `process.env.X` and `import.meta.env.X`, so define both forms.
  const studioEnvVars = await getStudioEnvironmentVariables(workDir)
  const define: Record<string, string> = {}
  for (const [k, v] of Object.entries(studioEnvVars)) {
    const json = JSON.stringify(v)
    define[`process.env.${k}`] = json
    define[`import.meta.env.${k}`] = json
  }
  // Bare `import.meta.env` (no key) — Vite provides this; without it, code that
  // destructures or spreads it would crash.
  define['import.meta.env'] = JSON.stringify(studioEnvVars)
  debug('define keys: %o', Object.keys(define))

  const outFile = join(cacheDir, 'manifest-bundle.mjs')

  const syntheticEntry = `
import config from ${JSON.stringify(configPath)}
import * as sanity from 'sanity'
import * as ui from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {isValidElement, createElement} from 'react'
import {isValidElementType} from 'react-is'
import {renderToReadableStream} from 'react-dom/server'
import {createClient} from '@sanity/client'
import {firstValueFrom, of} from 'rxjs'

// Stash the bundle's sanity module so cli-core's resolveLocalPackage can return it
// instead of re-importing sanity through vite-node (~2.5s saving).
globalThis[Symbol.for('@sanity/cli-core:bundled-sanity')] = sanity

const theme = buildTheme()

async function streamToString(stream) {
  await stream.allReady
  const reader = stream.getReader()
  const chunks = []
  while (true) {
    const {done, value} = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

async function renderIcon({icon, title, subtitle = ''}) {
  try {
    let element
    if (isValidElementType(icon)) element = createElement(icon)
    else if (isValidElement(icon)) element = icon
    else element = sanity.createDefaultIcon(title, subtitle)
    const wrapped = createElement(ui.ThemeProvider, {theme}, element)
    const stream = await renderToReadableStream(wrapped)
    const html = await streamToString(stream)
    return html.trim()
  } catch (err) {
    return null
  }
}

// Stash so the host's resolveIcon picks it up — uses the bundle's ThemeProvider +
// sanity instances so React contexts match.
globalThis[Symbol.for('@sanity/cli-core:bundled-render-icon')] = renderIcon

function getEmptyAuth() {
  return {
    authenticated: false,
    client: createClient({
      apiHost: 'http://localhost',
      apiVersion: '2025-02-01',
      projectId: 'unused',
      requestTagPrefix: 'sanity.cli',
      useCdn: false,
    }),
    currentUser: null,
  }
}

export async function loadWorkspaces() {
  const raw = Array.isArray(config)
    ? config
    : [{...config, basePath: config.basePath || '/', name: config.name || 'default'}]
  const unauthed = raw.map((w) => ({...w, auth: {state: of(getEmptyAuth())}}))
  return firstValueFrom(sanity.resolveConfig(unauthed))
}
`.trim()

  debug('Bundling studio config %s -> %s', configPath, outFile)

  // Honor the user's tsconfig `paths` (e.g. `"@/*": ["./src/*"]`) when present.
  // esbuild reads this automatically when given the path to tsconfig.json.
  const tsconfigPath = (await fileExists(join(workDir, 'tsconfig.json')))
    ? join(workDir, 'tsconfig.json')
    : undefined

  await build({
    // ESM bundles may emit top-level CJS `require()` calls when interop'ing CJS
    // deps; provide a shim so they don't crash under real ESM loading.
    banner: {
      js: `import {createRequire as __sanityCr} from 'node:module'\nconst require = __sanityCr(import.meta.url)`,
    },
    bundle: true,
    define,
    // Externalize React + react-dom so the bundle shares the host's React instance
    // (the icon resolver also loads react-dom/server natively — dual-React breaks it).
    external: ['node:*', 'react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
    format: 'esm',
    jsx: 'automatic',
    loader: {
      '.css': 'empty',
      '.jpg': 'empty',
      '.png': 'empty',
      '.svg': 'empty',
      '.woff': 'empty',
      '.woff2': 'empty',
    },
    logLevel: 'silent',
    outfile: outFile,
    platform: 'node',
    plugins: [
      peerFallbackPlugin(sanityUrl, SYNTHETIC_ENTRY_NAME),
      httpsImportsPlugin(),
      stubAssetsPlugin,
    ],
    stdin: {
      contents: syntheticEntry,
      loader: 'js',
      resolveDir: workDir,
      sourcefile: SYNTHETIC_ENTRY_NAME,
    },
    target: 'node22',
    tsconfig: tsconfigPath,
    write: true,
  })

  return outFile
}

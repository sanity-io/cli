import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {build, esmExternalRequirePlugin, parseAst} from 'vite'
import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {VENDOR_DIR} from '../constants.js'
import {createExternalFromImportMap} from '../createExternalFromImportMap.js'
import {createVendorImportMapFromBundle} from '../createVendorImportMapFromBundle.js'
import {resolveVendorBuildConfig} from '../resolveVendorBuildConfig.js'
import {createVendorNamedExportsPlugin} from '../vite/plugin-sanity-vendor-named-exports.js'

// The `@sanity/cli-build` package root, where `react`/`react-dom` are installed.
const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url))

interface ExportNode {
  type: string

  declaration?: {
    declarations?: Array<{id?: {name?: string; type: string}}>
    id?: {name?: string}
    type: string
  } | null
  specifiers?: Array<{exported: {name?: string; type: string; value?: string}}>
}

/** Collects the ESM export names declared by a (possibly minified) module. */
function collectExportNames(code: string): Set<string> {
  const program = parseAst(code) as unknown as {body: ExportNode[]}
  const names = new Set<string>()

  for (const node of program.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      names.add('default')
      continue
    }
    if (node.type !== 'ExportNamedDeclaration') continue

    for (const specifier of node.specifiers ?? []) {
      const {exported} = specifier
      names.add(exported.type === 'Literal' ? String(exported.value) : String(exported.name))
    }

    const declaration = node.declaration
    if (declaration?.type === 'VariableDeclaration') {
      for (const decl of declaration.declarations ?? []) {
        if (decl.id?.type === 'Identifier' && decl.id.name) names.add(decl.id.name)
      }
    } else if (declaration?.id?.name) {
      names.add(declaration.id.name)
    }
  }

  return names
}

/**
 * Builds the vendor entries exactly the way the main studio/app build does (see
 * the `vendorBuild` branch of `getViteConfig`): the resolved entries become
 * Rolldown inputs, chunks are emitted to `vendor/`, and both the named-export
 * and external-require plugins are applied. The import map is then derived from
 * the emitted bundle with `createVendorImportMapFromBundle`, mirroring what the
 * `sanity/server/build-entries` plugin does at `generateBundle` time.
 *
 * This is the single-build replacement for the former standalone vendor build:
 * it exercises the real resolution, plugins, output naming, and import-map
 * derivation against the actual `react`/`react-dom`/`styled-components`
 * packages.
 */
async function buildVendorChunks(outputDir: string): Promise<Record<string, string>> {
  // `isApp: false` builds the studio vendor set: react, react-dom (CommonJS)
  // and styled-components (ESM). All resolve from the @sanity/cli-build root.
  const {entries, namesByChunkName, specifiersByChunkName} = await resolveVendorBuildConfig({
    cwd: packageRoot,
    isApp: false,
  })

  const vendorChunkNames = new Set(Object.keys(specifiersByChunkName))

  // Each vendor specifier is external so that e.g. react-dom and styled-components
  // import `react` from the import map instead of bundling a second copy.
  const external = createExternalFromImportMap({
    imports: Object.fromEntries(
      Object.values(specifiersByChunkName).map((specifier) => [specifier, '']),
    ),
  })

  // removes the `RolldownWatcher` type
  type BuildResult = Exclude<Awaited<ReturnType<typeof build>>, {close: unknown}>

  const buildResult = (await build({
    appType: 'custom',
    build: {
      emptyOutDir: false,
      minify: 'oxc',
      outDir: outputDir,
      rolldownOptions: {
        experimental: {nativeMagicString: true},
        input: entries,
        output: {
          entryFileNames: (chunk) =>
            vendorChunkNames.has(chunk.name)
              ? `${VENDOR_DIR}/[name]-[hash].mjs`
              : 'static/[name]-[hash].js',
          exports: 'named',
        },
        // Mirror `getViteConfig`: keep entry exports so the browser can import
        // them via the generated import map.
        preserveEntrySignatures: 'exports-only',
        treeshake: true,
      },
    },
    cacheDir: path.join(outputDir, '.vite-cache'),
    configFile: false,
    define: {'process.env.NODE_ENV': JSON.stringify('production')},
    logLevel: 'silent',
    mode: 'production',
    plugins: [
      createVendorNamedExportsPlugin(namesByChunkName),
      esmExternalRequirePlugin({external}),
    ],
    root: packageRoot,
  })) as BuildResult

  const results = Array.isArray(buildResult) ? buildResult : [buildResult]

  const bundle: Record<string, {fileName: string; isEntry: boolean; name: string; type: 'chunk'}> =
    {}
  for (const result of results) {
    for (const chunk of result.output) {
      if (chunk.type !== 'chunk') continue
      bundle[chunk.fileName] = {
        fileName: chunk.fileName,
        isEntry: chunk.isEntry,
        name: chunk.name,
        type: 'chunk',
      }
    }
  }

  return createVendorImportMapFromBundle(bundle, specifiersByChunkName, '/')
}

describe('vendor build (single vite build)', () => {
  let outputDir: string
  let imports: Record<string, string>

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), 'sanity-vendor-'))
    imports = await buildVendorChunks(outputDir)
  }, 120_000)

  afterAll(async () => {
    if (outputDir) {
      await rm(outputDir, {force: true, recursive: true})
    }
  })

  async function exportsOf(specifier: string): Promise<Set<string>> {
    const importPath = imports[specifier]
    expect(importPath, `import map should contain '${specifier}'`).toBeTruthy()
    const code = await readFile(path.join(outputDir, importPath.replace(/^\/+/, '')), 'utf8')
    return collectExportNames(code)
  }

  test('import map entries are absolute (rooted) paths into /vendor', () => {
    expect(imports.react).toMatch(/^\/vendor\/react\/index-[^/]+\.mjs$/)
    expect(imports['react-dom/client']).toMatch(/^\/vendor\/react-dom\/client-[^/]+\.mjs$/)
  })

  test('react exposes named exports alongside the default', async () => {
    const names = await exportsOf('react')
    expect([...names]).toEqual(
      expect.arrayContaining(['default', 'createElement', 'useState', 'useEffect', 'Fragment']),
    )
  })

  test('react/jsx-runtime exposes jsx/jsxs/Fragment', async () => {
    const names = await exportsOf('react/jsx-runtime')
    expect([...names]).toEqual(expect.arrayContaining(['jsx', 'jsxs', 'Fragment']))
  })

  test('react-dom/client exposes createRoot/hydrateRoot', async () => {
    const names = await exportsOf('react-dom/client')
    expect([...names]).toEqual(expect.arrayContaining(['createRoot', 'hydrateRoot']))
  })

  // The `./server` + `./server.browser` pair share a source file, so this is the
  // entry most likely to surface the Shape-B re-export form.
  test('react-dom/server exposes renderToString', async () => {
    const names = await exportsOf('react-dom/server')
    expect([...names]).toEqual(expect.arrayContaining(['renderToString', 'renderToStaticMarkup']))
  })

  // styled-components is native ESM and statically `import`s react. Our named-export
  // plugin must leave its exports intact, and react must stay an external import
  // (resolved by the studio import map) rather than being bundled in.
  test('styled-components keeps its native ESM named exports', async () => {
    const names = await exportsOf('styled-components')
    expect([...names]).toEqual(
      expect.arrayContaining([
        'default',
        'styled',
        'css',
        'keyframes',
        'createGlobalStyle',
        'ThemeProvider',
        'useTheme',
      ]),
    )
  })

  test('styled-components imports react as an external, not bundled', async () => {
    const importPath = imports['styled-components']
    const code = await readFile(path.join(outputDir, importPath.replace(/^\/+/, '')), 'utf8')
    // react remains a bare external import (resolved at runtime via the import map)...
    expect(code).toMatch(/from\s*["']react["']/)
    // ...and react's implementation is not bundled into the chunk.
    expect(code).not.toContain('react.transitional.element')
    expect(code).not.toContain('ReactSharedInternals')
  })

  // `react-dom` does `require('react')`; without `esmExternalRequirePlugin`, Rolldown
  // leaves a runtime `require` shim that throws in the browser ("...doesn't expose the
  // `require` function"). The external require must instead become a real ESM import.
  test('external require() is converted to imports (no runtime require shim)', async () => {
    const vendorDir = path.join(outputDir, VENDOR_DIR)
    const files = (await readdir(vendorDir, {recursive: true})).filter((file) =>
      String(file).endsWith('.mjs'),
    )

    const offenders: string[] = []
    for (const file of files) {
      const code = await readFile(path.join(vendorDir, String(file)), 'utf8')
      if (/doesn't expose the|createRequire|__require\(/.test(code)) {
        offenders.push(String(file))
      }
    }

    expect(offenders).toEqual([])
  })
})

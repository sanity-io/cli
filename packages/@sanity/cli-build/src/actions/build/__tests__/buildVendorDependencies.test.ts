import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {parseAst} from 'vite'
import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {buildVendorDependencies} from '../buildVendorDependencies.js'

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

describe('buildVendorDependencies', () => {
  let outputDir: string
  let imports: Record<string, string>

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), 'sanity-vendor-'))
    // `isApp: false` builds the studio vendor set: react, react-dom (CommonJS)
    // and styled-components (ESM). All resolve from the @sanity/cli-build root.
    imports = await buildVendorDependencies({
      basePath: '/',
      cwd: packageRoot,
      isApp: false,
      outputDir,
    })
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
    const vendorDir = path.join(outputDir, 'vendor')
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

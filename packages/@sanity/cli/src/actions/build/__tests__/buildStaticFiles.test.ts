import {existsSync} from 'node:fs'
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {resolveVendorBuildConfig} from '@sanity/cli-build/_internal/build'
import {init, parse} from 'es-module-lexer'
import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {buildStaticFiles} from '../buildStaticFiles.js'

// The repo's basic-studio fixture (a workspace package with react, react-dom,
// styled-components and sanity installed) doubles as a real studio to build.
const studioPath = fileURLToPath(
  new URL('../../../../../../../fixtures/basic-studio/', import.meta.url),
)

const cdnImports = {
  sanity: 'https://sanity-cdn.example/v1/modules/sanity/default/%5E5.0.0/t1',
  'sanity/': 'https://sanity-cdn.example/v1/modules/sanity/default/%5E5.0.0/t1/',
}

const cdnCssUrls = ['https://sanity-cdn.example/v1/modules/sanity/default/%5E5.0.0/t1/index.css']

/** Extracts the JSON import map (`#__imports`) emitted into index.html. */
function parseImportMap(html: string): {css?: string[]; imports: Record<string, string>} {
  const json = html.match(/<script type="application\/json" id="__imports">(.+?)<\/script>/)?.[1]
  expect(json, 'index.html should contain an import map').toBeTruthy()
  return JSON.parse(json!)
}

/** Lists the ESM export names of a built chunk. */
async function exportNamesOf(filePath: string): Promise<string[]> {
  await init
  const [, exports] = parse(await readFile(filePath, 'utf8'))
  return exports.map((e) => e.n)
}

describe('buildStaticFiles', () => {
  describe('auto-updating studio', () => {
    let outputDir: string
    let specifiers: string[]
    let importMap: {css?: string[]; imports: Record<string, string>}

    function vendorChunkPath(specifier: string): string {
      return path.join(outputDir, importMap.imports[specifier].replace(/^\/+/, ''))
    }

    beforeAll(async () => {
      outputDir = await mkdtemp(path.join(tmpdir(), 'sanity-build-auto-updating-'))

      const vendor = await resolveVendorBuildConfig({cwd: studioPath, isApp: false})
      specifiers = Object.values(vendor.specifiersByChunkName)

      await buildStaticFiles({
        autoUpdates: {cssUrls: cdnCssUrls, imports: cdnImports, vendor},
        basePath: '/',
        cwd: studioPath,
        outputDir,
      })

      importMap = parseImportMap(await readFile(path.join(outputDir, 'index.html'), 'utf8'))

      // The emitted chunks are ESM; mark the output dir so Node can dynamically
      // import them in the tests below (the browser relies on MIME types instead).
      await writeFile(path.join(outputDir, 'package.json'), '{"type": "module"}')
    }, 120_000)

    afterAll(async () => {
      await rm(outputDir, {force: true, recursive: true})
    })

    test('maps every vendor specifier to a hashed vendor chunk emitted by the build', () => {
      expect(specifiers).toEqual(
        expect.arrayContaining(['react', 'react-dom/client', 'styled-components']),
      )

      for (const specifier of specifiers) {
        const importPath = importMap.imports[specifier]
        expect(importPath, `import map should contain '${specifier}'`).toMatch(
          /^\/vendor\/.+-.+\.mjs$/,
        )
        expect(existsSync(vendorChunkPath(specifier)), `${importPath} should exist`).toBe(true)
      }
    })

    test('merges the module-CDN imports and css urls into the import map', () => {
      expect(importMap.imports).toMatchObject(cdnImports)
      expect(importMap.css).toEqual(cdnCssUrls)
    })

    test('react vendor chunk is loadable ESM with named exports', async () => {
      const react = await import(pathToFileURL(vendorChunkPath('react')).href)

      expect(typeof react.useState).toBe('function')
      expect(typeof react.createElement).toBe('function')
      expect(typeof react.default.createElement).toBe('function')
    })

    test('CommonJS vendor entries re-expose their named exports', async () => {
      expect(await exportNamesOf(vendorChunkPath('react-dom/client'))).toEqual(
        expect.arrayContaining(['default', 'createRoot', 'hydrateRoot']),
      )
      expect(await exportNamesOf(vendorChunkPath('react/jsx-runtime'))).toEqual(
        expect.arrayContaining(['jsx', 'jsxs', 'Fragment']),
      )
    })

    test('styled-components keeps its native ESM named exports and imports react as external', async () => {
      const chunkPath = vendorChunkPath('styled-components')

      expect(await exportNamesOf(chunkPath)).toEqual(
        expect.arrayContaining(['default', 'styled', 'css', 'keyframes', 'ThemeProvider']),
      )

      const code = await readFile(chunkPath, 'utf8')
      // react stays a bare import resolved via the import map at runtime...
      expect(code).toMatch(/from\s*["']react["']/)
      // ...instead of a second copy of react being bundled into the chunk.
      // (`react.transitional.element` is react 19's element Symbol description,
      // a string literal that survives minification.)
      expect(code).not.toContain('react.transitional.element')
    })

    test('vendor chunks contain no CommonJS require shims', async () => {
      const vendorDir = path.join(outputDir, 'vendor')
      const files = (await readdir(vendorDir, {recursive: true})).filter((file) =>
        String(file).endsWith('.mjs'),
      )
      expect(files.length).toBeGreaterThan(0)

      for (const file of files) {
        const code = await readFile(path.join(vendorDir, String(file)), 'utf8')
        expect(code, `${file} should not require() at runtime`).not.toMatch(
          /doesn't expose the|createRequire|__require\(/,
        )
      }
    })

    test('the studio bundle keeps vendor packages external', async () => {
      const html = await readFile(path.join(outputDir, 'index.html'), 'utf8')
      const entryPath = html.match(/src="\/(static\/sanity-[^"]+\.js)"/)?.[1]
      expect(entryPath, 'index.html should reference the studio entry chunk').toBeTruthy()

      const entry = await readFile(path.join(outputDir, entryPath!), 'utf8')
      expect(entry).not.toContain('react.transitional.element')
    })
  })

  describe('non-auto-updating studio', () => {
    let outputDir: string

    beforeAll(async () => {
      outputDir = await mkdtemp(path.join(tmpdir(), 'sanity-build-bundled-'))

      await buildStaticFiles({
        basePath: '/',
        cwd: studioPath,
        outputDir,
      })
    }, 120_000)

    afterAll(async () => {
      await rm(outputDir, {force: true, recursive: true})
    })

    test('emits no vendor chunks and no import map', async () => {
      expect(existsSync(path.join(outputDir, 'vendor'))).toBe(false)

      const html = await readFile(path.join(outputDir, 'index.html'), 'utf8')
      expect(html).not.toContain('id="__imports"')
    })

    test('bundles react into the studio output', async () => {
      const staticDir = path.join(outputDir, 'static')
      const files = (await readdir(staticDir)).filter((file) => file.endsWith('.js'))

      let bundled = false
      for (const file of files) {
        const code = await readFile(path.join(staticDir, file), 'utf8')
        if (code.includes('react.transitional.element')) {
          bundled = true
          break
        }
      }

      expect(bundled).toBe(true)
    })
  })
})

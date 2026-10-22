import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {build as esbuild, type Plugin as EsbuildPlugin} from 'esbuild'
import {build, type Plugin as VitePlugin} from 'vite'
import {describe, expect, expectTypeOf, it} from 'vitest'

import esbuildPlugin from '../esbuild.js'
import {groqFilesPlugin} from '../plugin.js'
import vitePlugin from '../vite.js'

const QUERY = '*[_type == "post"]{title}'

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'groq-bundle-'))
  await writeFile(join(directory, 'posts.groq'), `${QUERY}\n`)
  await writeFile(
    join(directory, 'main.ts'),
    `import getPosts from './posts.groq'
import * as postsModule from './posts.groq'
export {getPosts, postsModule}
`,
  )
  return directory
}

async function load(directory: string, code: string): Promise<BundledModule> {
  const file = join(directory, 'bundle.mjs')
  await writeFile(file, code)
  return (await import(pathToFileURL(file).href)) as BundledModule
}

interface BundledModule {
  getPosts: string
  postsModule: Record<string, unknown>
}

function expectRuntimeShape(mod: BundledModule): void {
  expect(mod.getPosts).toBe(QUERY)
  expect(Object.keys(mod.postsModule)).toEqual(['default'])
  expect(mod.postsModule.default).toBe(QUERY)
}

describe('bundler plugins', () => {
  it('bundles a .groq import as the query string with Vite', async () => {
    const directory = await fixture()
    const built = await build({
      build: {
        lib: {entry: join(directory, 'main.ts'), fileName: 'out', formats: ['es']},
        outDir: join(directory, 'dist'),
        rollupOptions: {external: []},
        write: false,
      },
      configFile: false,
      logLevel: 'silent',
      plugins: [vitePlugin()],
      root: directory,
    })
    const bundle = Array.isArray(built) ? built[0] : built
    if (!bundle || !('output' in bundle)) throw new Error('Vite did not emit a bundle')
    const code = bundle.output.map((item) => (item.type === 'chunk' ? item.code : '')).join('\n')
    expectRuntimeShape(await load(directory, code))
  })

  it('bundles a .groq import with esbuild', async () => {
    const directory = await fixture()
    const result = await esbuild({
      bundle: true,
      entryPoints: [join(directory, 'main.ts')],
      format: 'esm',
      plugins: [esbuildPlugin()],
      write: false,
    })
    const code = result.outputFiles.map((file) => file.text).join('\n')
    expectRuntimeShape(await load(directory, code))
  })

  it('exposes one factory per bundler, typed as that bundler accepts', () => {
    expectTypeOf(groqFilesPlugin.vite).returns.toMatchTypeOf<VitePlugin>()
    expectTypeOf(groqFilesPlugin.esbuild).returns.toMatchTypeOf<EsbuildPlugin>()
    expect(groqFilesPlugin.vite).toBe(vitePlugin)
    expect(groqFilesPlugin.esbuild).toBe(esbuildPlugin)
    expect(groqFilesPlugin.vite().name).toBe('@sanity/groq-files')
    expect(typeof groqFilesPlugin.webpack().apply).toBe('function')
    expect(typeof groqFilesPlugin.rspack().apply).toBe('function')
    expect(groqFilesPlugin.rollup().name).toBe('@sanity/groq-files')
  })
})

import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {createServer, createServerModuleRunner} from 'vite'
import {describe, expect, onTestFinished, test} from 'vitest'

import {type GeneratedArtifact} from '../../../../src/actions/build/artifact.js'
import {mediaLibraryConfigArtifacts} from '../../../../src/actions/build/configs/artifact.js'
import {dashboardConfigArtifacts} from '../../../../src/actions/build/dashboardConfig/artifact.js'
import {RUNTIME_DIR} from '../../../../src/actions/build/vite/constants.js'
import {sanityExtensionArtifacts} from '../../../../src/actions/build/vite/plugins/plugin-sanity-extension-artifacts.js'

interface ConfigModule {
  config: unknown
  subscribe: (listener: (next: ConfigModule) => void) => () => void
  type: string
  version: number
}

/**
 * Serves a generated config module the way `sanity dev` does and loads it
 * through Vite's module runner, which shares the browser client's HMR code.
 */
async function serve(artifact: GeneratedArtifact, files: Record<string, string>) {
  // Vite keys modules by real path, and the system temp dir can be a symlink.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'config-hmr-')))
  const write = async (file: string, contents: string) => {
    await mkdir(path.dirname(path.join(root, file)), {recursive: true})
    await writeFile(path.join(root, file), contents)
  }
  for (const [file, contents] of Object.entries(files)) await write(file, contents)

  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    plugins: [sanityExtensionArtifacts({artifacts: [artifact]})],
    root,
    // No OS watcher: it drops a second change to a file within 50ms, so `edit`
    // reports each save itself, through the same path a real save takes.
    server: {middlewareMode: true, watch: null, ws: false},
  })
  // `hot.invalidate()` sends this, and the browser answers it with a page reload.
  let reloaded: (() => void) | undefined
  server.environments.ssr.hot.on('vite:invalidate', () => reloaded?.())
  let failedUpdate: ((message: string) => void) | undefined
  const runner = createServerModuleRunner(server.environments.ssr, {
    hmr: {logger: {debug() {}, error: (error) => failedUpdate?.(String(error))}},
  })
  // The runner shares the server's in-process channel, so closing the server
  // stops updates while one already in flight still finishes.
  onTestFinished(async () => {
    await server.close()
    await rm(root, {force: true, recursive: true})
  })

  return {
    edit: async (file: string, contents: string) => {
      await write(file, contents)
      server.watcher.emit('change', path.join(root, file))
    },
    load: () => runner.import<ConfigModule>(`/${RUNTIME_DIR}/${artifact.path}`),
    nextFailedUpdate: (expected: string) =>
      new Promise<void>((resolve) => {
        failedUpdate = (message) => message.includes(expected) && resolve()
      }),
    nextReload: () => new Promise<void>((resolve) => (reloaded = resolve)),
  }
}

const nextUpdate = (module: ConfigModule) =>
  new Promise<ConfigModule>((resolve) => module.subscribe(resolve))

const [artifact] = mediaLibraryConfigArtifacts({
  fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
})

const field = (type: string) => `export default {name: 'description', type: '${type}'}\n`
const fields = (module: ConfigModule) => (module.config as {fields: {config: unknown}[]}).fields

describe('media library config module in sanity dev', () => {
  test('exports every field with its metadata and definition', async () => {
    const [twoFields] = mediaLibraryConfigArtifacts({
      fields: [
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        {name: 'language', src: './src/language.ts', title: 'Language'},
      ],
    })
    const dev = await serve(twoFields, {
      'src/description.ts': `export default {name: 'description', type: 'text'}\n`,
      'src/language.ts': `export default {name: 'language', type: 'string'}\n`,
    })

    const module = await dev.load()

    expect({config: module.config, type: module.type, version: module.version}).toStrictEqual({
      config: {
        fields: [
          {
            config: {name: 'description', type: 'text'},
            name: 'description',
            public: true,
            title: 'Description',
          },
          {
            config: {name: 'language', type: 'string'},
            name: 'language',
            public: false,
            title: 'Language',
          },
        ],
      },
      type: 'installation_config',
      version: 1,
    })
  })

  test('applies an edit to its subscriber in place', async () => {
    const dev = await serve(artifact, {'src/description.ts': field('text')})
    const update = nextUpdate(await dev.load())

    await dev.edit('src/description.ts', field('string'))

    expect(fields(await update)[0]?.config).toStrictEqual({name: 'description', type: 'string'})
  })

  test('keeps the last good config when an edit throws, then applies the fix in place', async () => {
    const dev = await serve(artifact, {'src/description.ts': field('text')})
    const module = await dev.load()
    const updates: unknown[] = []
    module.subscribe((next) => updates.push(fields(next)[0]?.config))
    let reloads = 0
    void dev.nextReload().then(() => reloads++)

    const failed = dev.nextFailedUpdate('broken')
    await dev.edit('src/description.ts', `throw new Error('broken')\n`)
    await failed
    const update = nextUpdate(module)
    await dev.edit('src/description.ts', field('string'))
    await update

    expect(updates).toStrictEqual([{name: 'description', type: 'string'}])
    expect(reloads).toBe(0)
  })

  test('reloads when an edit has no subscriber to apply it', async () => {
    const dev = await serve(artifact, {'src/description.ts': field('text')})
    await dev.load()
    const reload = dev.nextReload()

    await dev.edit('src/description.ts', field('string'))

    await expect(reload).resolves.toBeUndefined()
  })

  test('reloads with the fixed config when the first load threw', async () => {
    const dev = await serve(artifact, {'src/description.ts': `throw new Error('broken')\n`})
    await expect(dev.load()).rejects.toThrow('broken')
    const reload = dev.nextReload()

    await dev.edit('src/description.ts', field('string'))

    await expect(reload).resolves.toBeUndefined()
  })
})

describe('dashboard configuration module in sanity dev', () => {
  const [dashboardArtifact] = dashboardConfigArtifacts({src: './src/dashboard.ts'})

  test('exports the configuration with its contract type and version', async () => {
    const dev = await serve(dashboardArtifact, {
      'src/dashboard.ts': `export default {title: 'Favorites'}\n`,
    })

    const module = await dev.load()

    expect({config: module.config, type: module.type, version: module.version}).toStrictEqual({
      config: {title: 'Favorites'},
      type: 'dashboard_config',
      version: 1,
    })
  })

  test('applies an edit to its subscriber in place', async () => {
    const dev = await serve(dashboardArtifact, {
      'src/dashboard.ts': `export default {title: 'Favorites'}\n`,
    })
    const update = nextUpdate(await dev.load())

    await dev.edit('src/dashboard.ts', `export default {title: 'Starred items'}\n`)

    expect((await update).config).toStrictEqual({title: 'Starred items'})
  })
})

import {describe, expect, test, vi} from 'vitest'

import {type MediaLibraryConfigArtifact, mediaLibraryConfigArtifacts} from '../artifact.js'

const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const config = (fields: MediaLibraryConfigArtifact['fields']): MediaLibraryConfigArtifact => ({
  fields,
})

/** A minimal stand-in for Vite's `import.meta.hot` on the generated module. */
interface FakeHot {
  accept: (callback: (next: unknown) => void) => void
  acceptCallback: ((next: unknown) => void) | undefined
  invalidate: ReturnType<typeof vi.fn>
}

function fakeHot(): FakeHot {
  const hot: FakeHot = {
    accept(callback) {
      hot.acceptCallback = callback
    },
    acceptCallback: undefined,
    invalidate: vi.fn(),
  }
  return hot
}

interface InstantiatedConfigModule {
  _adoptListeners: (shared: Set<(next: unknown) => void>) => void
  config: unknown
  subscribe: (listener: (next: unknown) => void) => () => void
  type: string
  version: number
}

/**
 * Execute the generated module source so the HMR handle is tested as code,
 * not as text: field imports become stubs, exports become locals that the
 * wrapper returns, and `import.meta.hot` becomes the injected fake.
 */
function instantiate(source: string, hot: FakeHot): InstantiatedConfigModule {
  const transformed = source
    .replaceAll(/^import field_(\d+) from .*$/gm, 'const field_$1 = {stub: true}')
    .replaceAll(/^export const /gm, 'const ')
    .replaceAll(/^export function /gm, 'function ')
    .replaceAll('import.meta.hot', '__hot__')
  const factory = new Function(
    '__hot__',
    `${transformed}\nreturn {_adoptListeners, config, subscribe, type, version}`,
  )
  return factory(hot) as InstantiatedConfigModule
}

function buildModule(hot: FakeHot): InstantiatedConfigModule {
  const [artifact] = mediaLibraryConfigArtifacts(
    config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
  )
  return instantiate(artifact.source({resolveImport}), hot)
}

describe('mediaLibraryConfigArtifacts', () => {
  test('exposes one module for the config under ./configs/<type>', () => {
    const [artifact] = mediaLibraryConfigArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    expect(artifact.expose).toBe('./configs/installation_config')
    expect(artifact.path).toBe('configs/installation_config.js')
  })

  test('aggregates every field into one module under `config`', () => {
    const [artifact] = mediaLibraryConfigArtifacts(
      config([
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        {name: 'language', src: './src/language.ts', title: 'Language'},
      ]),
    )
    const source = artifact.source({resolveImport})
    expect(source).toContain(`import field_0 from "../../src/description.ts"`)
    expect(source).toContain(`import field_1 from "../../src/language.ts"`)
    expect(source).toContain('export const config = {')
    expect(source).not.toContain('appType')
    expect(source).toContain('export const type = "installation_config"')
  })

  test('surfaces each field metadata for the host to dispatch on', () => {
    const [artifact] = mediaLibraryConfigArtifacts(
      config([
        {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
      ]),
    )
    const source = artifact.source({resolveImport})
    expect(source).toContain('name: "description"')
    expect(source).toContain('title: "Description"')
    expect(source).toContain('public: true')
    expect(source).toContain('config: field_0')
  })

  test('defaults public to false when omitted', () => {
    const [artifact] = mediaLibraryConfigArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    expect(artifact.source({resolveImport})).toContain('public: false')
  })

  test('carries the HMR handle on the module itself — no window events or timers', () => {
    const [artifact] = mediaLibraryConfigArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    const source = artifact.source({resolveImport})
    // The host loads this module once through Module Federation and never
    // re-reads it — a bare self-accept would leave field edits invisible.
    expect(source).not.toMatch(/import\.meta\.hot\.accept\(\)/)
    expect(source).toContain('export function subscribe')
    // The handle replaces the former window-event wire format wholesale.
    expect(source).not.toContain('window.')
    expect(source).not.toContain('vite:afterUpdate')
    expect(source).not.toContain('sanity:media-library-fields-hmr')
    expect(source).not.toContain('setTimeout')
  })

  test('notifies subscribers with the fresh module on hot update', () => {
    const hotV1 = fakeHot()
    const moduleV1 = buildModule(hotV1)
    const listener = vi.fn()
    moduleV1.subscribe(listener)

    const hotV2 = fakeHot()
    const moduleV2 = buildModule(hotV2)
    hotV1.acceptCallback?.(moduleV2)

    expect(listener).toHaveBeenCalledExactlyOnceWith(moduleV2)
    expect(hotV1.invalidate).not.toHaveBeenCalled()
  })

  test('forwards subscribers to the incoming module so later updates still reach them', () => {
    const hotV1 = fakeHot()
    const moduleV1 = buildModule(hotV1)
    const listener = vi.fn()
    moduleV1.subscribe(listener)

    const hotV2 = fakeHot()
    const moduleV2 = buildModule(hotV2)
    hotV1.acceptCallback?.(moduleV2)

    // The second edit runs the accept registered by the second module; the
    // listener must have been carried across or updates would silently stop.
    const hotV3 = fakeHot()
    const moduleV3 = buildModule(hotV3)
    hotV2.acceptCallback?.(moduleV3)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(moduleV3)
  })

  test('an unsubscribe handle from before an update still works after it', () => {
    const hotV1 = fakeHot()
    const moduleV1 = buildModule(hotV1)
    const listener = vi.fn()
    // The host keeps this handle from the first Module Federation evaluation.
    const unsubscribe = moduleV1.subscribe(listener)

    const hotV2 = fakeHot()
    const moduleV2 = buildModule(hotV2)
    hotV1.acceptCallback?.(moduleV2)
    expect(listener).toHaveBeenCalledTimes(1)

    // The live set travels across updates, so the old handle must still
    // remove the listener — a copied set would orphan it here.
    unsubscribe()

    const hotV3 = fakeHot()
    hotV2.acceptCallback?.(buildModule(hotV3))
    expect(listener).toHaveBeenCalledTimes(1)
    // With the listener gone the second update has no in-page consumer.
    expect(hotV2.invalidate).toHaveBeenCalledOnce()
  })

  test('unsubscribe stops notifications', () => {
    const hotV1 = fakeHot()
    const moduleV1 = buildModule(hotV1)
    const listener = vi.fn()
    const unsubscribe = moduleV1.subscribe(listener)
    unsubscribe()

    const hotV2 = fakeHot()
    hotV1.acceptCallback?.(buildModule(hotV2))

    expect(listener).not.toHaveBeenCalled()
    // With no listeners left the update has no in-page consumer — reload.
    expect(hotV1.invalidate).toHaveBeenCalledOnce()
  })

  test('invalidates (native full reload) when no host ever subscribed', () => {
    const hotV1 = fakeHot()
    buildModule(hotV1)

    const hotV2 = fakeHot()
    hotV1.acceptCallback?.(buildModule(hotV2))

    expect(hotV1.invalidate).toHaveBeenCalledOnce()
  })

  test('invalidates when the update produced no usable module', () => {
    const hotV1 = fakeHot()
    const moduleV1 = buildModule(hotV1)
    moduleV1.subscribe(vi.fn())

    hotV1.acceptCallback?.(undefined)
    expect(hotV1.invalidate).toHaveBeenCalledOnce()

    // A namespace without the hot-chain handle cannot carry listeners on.
    hotV1.acceptCallback?.({config: {fields: []}, subscribe: vi.fn()})
    expect(hotV1.invalidate).toHaveBeenCalledTimes(2)
  })

  test('invalidates when a subscriber fails to apply the update', () => {
    const hotV1 = fakeHot()
    const moduleV1 = buildModule(hotV1)
    moduleV1.subscribe(() => {
      throw new Error('apply failed')
    })

    const hotV2 = fakeHot()
    hotV1.acceptCallback?.(buildModule(hotV2))

    expect(hotV1.invalidate).toHaveBeenCalledOnce()
  })

  test('returns nothing when the app has no config', () => {
    expect(mediaLibraryConfigArtifacts(undefined)).toEqual([])
    expect(mediaLibraryConfigArtifacts(undefined, {islandRuntime: true})).toEqual([])
  })

  test('exposes the island runtime when the installed sanity ships it', () => {
    const artifacts = mediaLibraryConfigArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
      {islandRuntime: true},
    )
    expect(artifacts).toHaveLength(2)
    const island = artifacts[1]
    expect(island.expose).toBe('./media-library-island-runtime')
    expect(island.path).toBe('configs/media_library_island_runtime.js')
    expect(island.source({resolveImport})).toContain(
      'export * from "sanity/media-library-island-runtime"',
    )
  })

  test('skips the island runtime expose on older sanity versions', () => {
    const artifacts = mediaLibraryConfigArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
      {islandRuntime: false},
    )
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].expose).toBe('./configs/installation_config')
  })
})

import {describe, expect, test} from 'vitest'

import {type ConfigArtifact, configArtifacts} from '../artifact.js'

const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const config = (fields: ConfigArtifact['fields']): ConfigArtifact => ({fields})

describe('configArtifacts', () => {
  test('exposes one module for the config under ./configs/<type>', () => {
    const [artifact] = configArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    expect(artifact.expose).toBe('./configs/installation_config')
    expect(artifact.path).toBe('configs/installation_config.js')
  })

  test('aggregates every field into one module under `config`', () => {
    const [artifact] = configArtifacts(
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
    const [artifact] = configArtifacts(
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
    const [artifact] = configArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    expect(artifact.source({resolveImport})).toContain('public: false')
  })

  test('emits an HMR accept that forwards the fresh module to the Media Library host', () => {
    const [artifact] = configArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    const source = artifact.source({resolveImport})
    // The host loads this module once through Module Federation and never
    // re-reads it — a bare self-accept would leave field edits invisible.
    expect(source).not.toMatch(/import\.meta\.hot\.accept\(\)/)
    expect(source).toContain('import.meta.hot.accept((mod) => {')
    expect(source).toContain("new CustomEvent('sanity:media-library-fields-hmr', {detail})")
    // Same-window dispatch only: a cross-origin parent throws on dispatchEvent.
    expect(source).not.toContain('window.parent')
  })

  test('returns nothing when the app has no config', () => {
    expect(configArtifacts(undefined)).toEqual([])
    expect(configArtifacts(undefined, {islandRuntime: true})).toEqual([])
  })

  test('exposes the island runtime when the installed sanity ships it', () => {
    const artifacts = configArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
      {islandRuntime: true},
    )
    expect(artifacts).toHaveLength(2)
    const island = artifacts[1]
    expect(island.expose).toBe('./island-runtime')
    expect(island.path).toBe('configs/island_runtime.js')
    expect(island.source({resolveImport})).toContain(
      'export * from "sanity/media-library-island-runtime"',
    )
  })

  test('skips the island runtime expose on older sanity versions', () => {
    const artifacts = configArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
      {islandRuntime: false},
    )
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].expose).toBe('./configs/installation_config')
  })
})

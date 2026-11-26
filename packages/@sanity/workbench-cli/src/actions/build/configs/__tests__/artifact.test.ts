import {describe, expect, test} from 'vitest'

import {type MediaLibraryConfigArtifact, mediaLibraryConfigArtifacts} from '../artifact.js'

const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const config = (fields: MediaLibraryConfigArtifact['fields']): MediaLibraryConfigArtifact => ({
  fields,
})

describe('mediaLibraryConfigArtifacts', () => {
  test('exposes one module for the config under ./configs/<type>', () => {
    const [artifact] = mediaLibraryConfigArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    expect(artifact.expose).toBe('./configs/installation_config')
    expect(artifact.path).toBe('configs/installation_config.js')
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

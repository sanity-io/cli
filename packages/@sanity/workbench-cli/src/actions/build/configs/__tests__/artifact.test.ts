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

  test('emits an HMR self-accept so a field edit swaps the config in place', () => {
    const [artifact] = configArtifacts(
      config([{name: 'description', src: './src/description.ts', title: 'Description'}]),
    )
    expect(artifact.source({resolveImport})).toContain('import.meta.hot.accept()')
  })

  test('returns nothing when the app has no config', () => {
    expect(configArtifacts(undefined)).toEqual([])
  })
})

import {resolve} from 'node:path'

import {describe, expect, test} from 'vitest'
import {parse as parseYaml} from 'yaml'

import {buildFixtureWorkspace, fixtureWorkspaceConfig} from './fixtureWorkspace.js'

describe('fixtureWorkspaceConfig', () => {
  test('copies the build-script allowlist and leaves the release-age gate on the repo', () => {
    const config = fixtureWorkspaceConfig({
      allowBuilds: {esbuild: true, sharp: false},
      catalog: {sanity: '^6.22.0'},
      minimumReleaseAge: 4320,
      minimumReleaseAgeExclude: ['@sanity/*', 'sanity'],
    })

    expect(config).toEqual({
      allowBuilds: {esbuild: true, sharp: false},
    })
  })

  test('requires the build-script allowlist', () => {
    expect(() => fixtureWorkspaceConfig({})).toThrow(
      "Could not find 'allowBuilds' in pnpm-workspace.yaml",
    )
  })

  test('builds a fixture workspace from the repository allowlist', async () => {
    const repoWorkspace = resolve(import.meta.dirname, '../../../..', 'pnpm-workspace.yaml')
    const config = parseYaml(await buildFixtureWorkspace(repoWorkspace)) as {
      allowBuilds: Record<string, boolean>
    }

    expect(config.allowBuilds.esbuild).toBe(true)
    expect(config).not.toHaveProperty('minimumReleaseAge')
    expect(config).not.toHaveProperty('minimumReleaseAgeExclude')
    expect(config).not.toHaveProperty('minimumReleaseAgeStrict')
    expect(config).not.toHaveProperty('catalog')
  })
})

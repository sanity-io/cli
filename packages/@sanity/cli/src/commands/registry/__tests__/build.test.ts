import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {buildRegistryManifest} from '../../../actions/registry/buildRegistryManifest.js'
import {BuildRegistryCommand} from '../build.js'

vi.mock('../../../actions/registry/buildRegistryManifest.js', () => ({
  buildRegistryManifest: vi.fn(),
}))

const mockedBuildRegistryManifest = vi.mocked(buildRegistryManifest)

describe('#registry:build', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('builds manifest and prints output path', async () => {
    mockedBuildRegistryManifest.mockResolvedValueOnce({
      manifest: {files: [], name: 'core-demo', version: '1.0.0'},
      manifestPath: '/tmp/registry/sanity-registry.json',
      scannedDirectories: ['src/schema-types', 'src/components', 'src/files'],
    })

    const {error, stdout} = await testCommand(BuildRegistryCommand, ['/tmp/registry'])
    if (error) throw error

    expect(mockedBuildRegistryManifest).toHaveBeenCalledWith({
      dryRun: false,
      registryDirectory: '/tmp/registry',
    })
    expect(stdout).toContain('Wrote /tmp/registry/sanity-registry.json')
    expect(stdout).toContain('Scanned conventions')
  })

  test('prints generated manifest in dry-run mode', async () => {
    mockedBuildRegistryManifest.mockResolvedValueOnce({
      manifest: {
        files: [{source: 'schema-types/a.ts', target: '{schemaDir}/a.ts'}],
        name: 'demo',
        version: '1.0.0',
      },
      manifestPath: '/tmp/registry/sanity-registry.json',
      scannedDirectories: ['src/schema-types', 'src/components', 'src/files'],
    })

    const {error, stdout} = await testCommand(BuildRegistryCommand, ['/tmp/registry', '--dry-run'])
    if (error) throw error

    expect(mockedBuildRegistryManifest).toHaveBeenCalledWith({
      dryRun: true,
      registryDirectory: '/tmp/registry',
    })
    expect(stdout).toContain('Generated manifest (dry run)')
    expect(stdout).toContain('"name": "demo"')
  })
})

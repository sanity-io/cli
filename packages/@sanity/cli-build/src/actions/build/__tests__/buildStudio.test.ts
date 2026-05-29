import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildStudio} from '../buildStudio'
import {type Output} from '@sanity/cli-core'

const mockedSelect = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    select: mockedSelect,
  }
})

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#buildStudio', () => {
  beforeEach(() => {
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should skip version prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    // const {error, stderr} = await testCommand(BuildCommand, [])
    buildStudio({
      appId: undefined,
      autoUpdatesEnabled: true,
      calledFromDeploy: false,
      determineBasePath: () => '/',
      getEnvironmentVariables: () => ({}),
      isApp: false,
      minify: true,
      outDir: `${cwd}/dist`,
      output,
      projectId: undefined,
      reactCompiler: undefined,
      schemaExtraction: undefined,
      sourceMap: true,
      stats: true,
      unattendedMode: true,
      upgradePackages: async () => {},
      vite: undefined,
      workDir: cwd,
    })

    expect(mockedSelect).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Build Sanity Studio'))
  })
})

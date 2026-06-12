import {Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

const FLAGS = {
  'auto-updates': true,
  json: false,
  minify: true,
  'source-maps': true,
  stats: true,
  yes: true,
} as const

const mockGetStudioEnvironmentVariables = vi.hoisted(() => vi.fn().mockReturnValue({}))

vi.mock('../buildStaticFiles.js', () => ({
  buildStaticFiles: vi.fn().mockResolvedValue({chunks: []}),
}))

vi.mock('../checkRequiredDependencies.js', () => ({
  checkRequiredDependencies: vi.fn().mockResolvedValue({installedSanityVersion: '3.0.0'}),
}))

vi.mock('../getEnvironmentVariables.js', () => ({
  getStudioEnvironmentVariables: mockGetStudioEnvironmentVariables,
}))

vi.mock('@sanity/cli-build/_internal/build', () => ({
  buildDebug: vi.fn(),
  checkStudioDependencyVersions: vi.fn().mockResolvedValue(undefined),
  resolveVendorBuildConfig: vi.fn().mockResolvedValue({
    entries: {},
    namesByChunkName: {},
    specifiersByChunkName: {},
  }),
  StudioBuildTrace: {},
}))

// Import after mocks are set up
const {buildStudio} = await import('../buildStudio.js')

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#buildStudio', () => {
  test('outputs included environment variables', async () => {
    const output = createMockOutput()

    mockGetStudioEnvironmentVariables.mockImplementation(() => ({
      SANITY_STUDIO_TEST_VAR: 'test-value',
    }))

    await buildStudio({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('SANITY_STUDIO_TEST_VAR'))
  })
})

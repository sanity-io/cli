import {afterEach, describe, expect, test, vi} from 'vitest'

const mockImportModule = vi.hoisted(() => vi.fn())
const mockFindPathForFiles = vi.hoisted(() => vi.fn())

vi.mock('../../util/importModule.js', () => ({
  importModule: mockImportModule,
}))

vi.mock('../util/findConfigsPaths.js', () => ({
  findPathForFiles: mockFindPathForFiles,
}))

const ROOT = '/mock/project'

function setupSingleConfig(configPath = `${ROOT}/sanity.cli.ts`) {
  mockFindPathForFiles.mockResolvedValue([
    {exists: true, path: configPath},
    {exists: false, path: `${ROOT}/sanity.cli.js`},
  ])
}

async function freshImport() {
  const mod = await import('../cli/getCliConfig.js')
  return mod.getCliConfig
}

describe('getCliConfig', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('returns parsed config', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockResolvedValue({api: {dataset: 'prod', projectId: 'abc'}})

    const config = await getCliConfig(ROOT)

    expect(config).toEqual({api: {dataset: 'prod', projectId: 'abc'}})
    expect(mockImportModule).toHaveBeenCalledOnce()
  })

  test('throws when no config found', async () => {
    const getCliConfig = await freshImport()
    mockFindPathForFiles.mockResolvedValue([
      {exists: false, path: `${ROOT}/sanity.cli.ts`},
      {exists: false, path: `${ROOT}/sanity.cli.js`},
    ])

    await expect(getCliConfig(ROOT)).rejects.toThrow('No CLI config found at')
  })

  test('throws when multiple config files found', async () => {
    const getCliConfig = await freshImport()
    mockFindPathForFiles.mockResolvedValue([
      {exists: true, path: `${ROOT}/sanity.cli.ts`},
      {exists: true, path: `${ROOT}/sanity.cli.js`},
    ])

    await expect(getCliConfig(ROOT)).rejects.toThrow('Multiple CLI config files found')
  })

  test('throws when import fails', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockRejectedValue(new Error('syntax error'))

    await expect(getCliConfig(ROOT)).rejects.toThrow('CLI config cannot be loaded')
  })

  test('throws on schema validation failure', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockResolvedValue({api: {projectId: 123}})

    await expect(getCliConfig(ROOT)).rejects.toThrow('Invalid CLI config')
  })

  test('caches result — subsequent calls only import once', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockResolvedValue({api: {projectId: 'abc'}})

    const first = await getCliConfig(ROOT)
    const second = await getCliConfig(ROOT)

    expect(first).toBe(second)
    expect(mockImportModule).toHaveBeenCalledOnce()
  })

  test('evicts cache on import error so next call retries', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockRejectedValueOnce(new Error('transient'))

    await expect(getCliConfig(ROOT)).rejects.toThrow('CLI config cannot be loaded')

    // Second call should retry
    mockImportModule.mockResolvedValue({api: {projectId: 'ok'}})

    const config = await getCliConfig(ROOT)

    expect(config).toEqual({api: {projectId: 'ok'}})
    expect(mockImportModule).toHaveBeenCalledTimes(2)
  })

  test('evicts cache on NotFoundError so next call retries', async () => {
    const getCliConfig = await freshImport()

    // First call — no config files
    mockFindPathForFiles.mockResolvedValueOnce([
      {exists: false, path: `${ROOT}/sanity.cli.ts`},
      {exists: false, path: `${ROOT}/sanity.cli.js`},
    ])

    await expect(getCliConfig(ROOT)).rejects.toThrow('No CLI config found at')

    // Second call — config now exists
    setupSingleConfig()
    mockImportModule.mockResolvedValue({api: {dataset: 'dev'}})

    const config = await getCliConfig(ROOT)

    expect(config).toEqual({api: {dataset: 'dev'}})
  })

  test('deduplicates concurrent calls — only one import', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockResolvedValue({api: {projectId: 'concurrent'}})

    const [a, b, c] = await Promise.all([
      getCliConfig(ROOT),
      getCliConfig(ROOT),
      getCliConfig(ROOT),
    ])

    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(mockImportModule).toHaveBeenCalledOnce()
  })

  test('caches independently per rootPath', async () => {
    const getCliConfig = await freshImport()
    const OTHER_ROOT = '/mock/other-project'

    // Setup for ROOT
    mockFindPathForFiles.mockResolvedValueOnce([
      {exists: true, path: `${ROOT}/sanity.cli.ts`},
      {exists: false, path: `${ROOT}/sanity.cli.js`},
    ])
    mockImportModule.mockResolvedValueOnce({api: {projectId: 'abc'}})

    // Setup for OTHER_ROOT
    mockFindPathForFiles.mockResolvedValueOnce([
      {exists: true, path: `${OTHER_ROOT}/sanity.cli.ts`},
      {exists: false, path: `${OTHER_ROOT}/sanity.cli.js`},
    ])
    mockImportModule.mockResolvedValueOnce({api: {projectId: 'xyz'}})

    const configA = await getCliConfig(ROOT)
    const configB = await getCliConfig(OTHER_ROOT)

    expect(configA).toEqual({api: {projectId: 'abc'}})
    expect(configB).toEqual({api: {projectId: 'xyz'}})
    expect(mockImportModule).toHaveBeenCalledTimes(2)

    // Subsequent calls return cached values
    const configA2 = await getCliConfig(ROOT)
    const configB2 = await getCliConfig(OTHER_ROOT)

    expect(configA2).toBe(configA)
    expect(configB2).toBe(configB)
    expect(mockImportModule).toHaveBeenCalledTimes(2)
  })

  test('concurrent callers all receive the rejection', async () => {
    const getCliConfig = await freshImport()
    setupSingleConfig()
    mockImportModule.mockRejectedValue(new Error('boom'))

    const results = await Promise.allSettled([
      getCliConfig(ROOT),
      getCliConfig(ROOT),
      getCliConfig(ROOT),
    ])

    for (const result of results) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected') {
        expect(result.reason.message).toBe('CLI config cannot be loaded')
      }
    }

    expect(mockImportModule).toHaveBeenCalledOnce()
  })
})

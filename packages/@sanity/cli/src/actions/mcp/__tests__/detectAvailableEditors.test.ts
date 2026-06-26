import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockCreateDetectionEnv = vi.hoisted(() => vi.fn())
const mockExistsSync = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())
const mockParseToml = vi.hoisted(() => vi.fn())
const mockParseJsonc = vi.hoisted(() => vi.fn())

// Because EDITOR_CONFIGS are imported once, need to use doMock in each test to ensure we can manipulate the configs in each test separately.
function createFreshEditorConfigMocks(cfgs: Record<string, any>) {
  vi.doMock('../editorConfigs.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../editorConfigs.js')>()
    return {
      ...actual,
      createDetectionEnv: mockCreateDetectionEnv,
      get EDITOR_CONFIGS() {
        return cfgs
      },
    }
  })

  vi.doMock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>()
    return {
      ...actual,
      existsSync: mockExistsSync,
    }
  })

  vi.doMock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>()
    return {
      ...actual,
      readFile: mockReadFile,
    }
  })

  vi.doMock('smol-toml', async (importOriginal) => {
    const actual = await importOriginal<typeof import('smol-toml')>()
    return {
      ...actual,
      parse: mockParseToml,
    }
  })

  vi.doMock('jsonc-parser', async (importOriginal) => {
    const actual = await importOriginal<typeof import('smol-toml')>()
    return {
      ...actual,
      parse: mockParseJsonc,
    }
  })
}

const configPath = '/some/path'

describe('mcp:detectAvailableEditors', () => {
  beforeEach(() => {
    // Reset modules to clear the require/import cache between tests - necessary to 'clear' the cached EDITOR_CONFIGS import
    vi.resetModules()
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue('{}')
    mockParseJsonc.mockReturnValue({})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should filter out editor configs that return falsy config paths', async () => {
    const detect = vi.fn().mockResolvedValue(false)
    createFreshEditorConfigMocks({'very-complex-magic-8ball': {detect}})
    const {detectAvailableEditors} = await import('../detectAvailableEditors.js')
    const res = await detectAvailableEditors()

    expect(detect).toHaveBeenCalled()
    expect(res).toEqual([])
  })

  test('should return editor configs with configured=false if config path does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    const name = 'stochastic-parrot'
    const detect = vi.fn().mockResolvedValue(configPath)
    createFreshEditorConfigMocks({[name]: {detect}})
    const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

    const res = await detectAvailableEditors()

    expect(res).toEqual([{configPath, configured: false, name}])
  })

  describe('parseable configs', () => {
    test('should return editor config with configured=false if parsed config does not contain Sanity key under its configKey', async () => {
      const name = 'sycophantic-ELIZA'
      const configKey = 'secret'
      const detect = vi.fn().mockReturnValue(configPath)
      createFreshEditorConfigMocks({[name]: {configKey, detect, format: 'jsonc'}})
      mockParseJsonc.mockReturnValue({[configKey]: {}})
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(res).toEqual([{configPath, configured: false, name}])
    })

    test('should return editor config with configured=true and existingToken if parsed config contains Sanity key under its configKey and its readToken method returns something', async () => {
      const name = 'slop-machine'
      const configKey = 'secret'
      const detect = vi.fn().mockReturnValue(configPath)
      createFreshEditorConfigMocks({
        [name]: {configKey, detect, format: 'jsonc', readToken: () => 'token'},
      })
      mockParseJsonc.mockReturnValue({[configKey]: {Sanity: {}}})
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(res).toEqual([{configPath, configured: true, existingToken: 'token', name}])
    })

    test('should return editor config with configured=true if parsed config contains Sanity key under its configKey', async () => {
      const name = 'slop-machine'
      const configKey = 'secret'
      const detect = vi.fn().mockReturnValue(configPath)
      createFreshEditorConfigMocks({
        [name]: {configKey, detect, format: 'jsonc', readToken: () => undefined},
      })
      mockParseJsonc.mockReturnValue({[configKey]: {Sanity: {}}})
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(res).toEqual([{configPath, configured: true, name}])
    })

    test('should return editor config with configured=true and authStatus=valid if editor config contains oauthOnly and parsed config contains Sanity key under its configKey', async () => {
      const name = 'slop-machine'
      const configKey = 'secret'
      const detect = vi.fn().mockReturnValue(configPath)
      createFreshEditorConfigMocks({
        [name]: {configKey, detect, format: 'jsonc', oauthOnly: true, readToken: () => undefined},
      })
      mockParseJsonc.mockReturnValue({[configKey]: {Sanity: {}}})
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(res).toEqual([{authStatus: 'valid', configPath, configured: true, name}])
    })
  })

  describe('unparseable configs', () => {
    test('should filter out editor TOML configs that return non-objects', async () => {
      const name = 'humongous-regular-expression'
      const detect = vi.fn().mockResolvedValue(configPath)
      createFreshEditorConfigMocks({[name]: {detect, format: 'toml'}})
      mockParseToml.mockReturnValue([])
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(detect).toHaveBeenCalled()
      expect(res).toEqual([])
    })

    test('should filter out editor TOML configs that throw upon parsing', async () => {
      const name = 'forgetful-lying-robot'
      const detect = vi.fn().mockReturnValue(configPath)
      createFreshEditorConfigMocks({[name]: {detect, format: 'toml'}})
      mockParseToml.mockThrow('boom')
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(detect).toHaveBeenCalled()
      expect(res).toEqual([])
    })

    test('should filter out editor JSON configs that returns a non-object', async () => {
      const name = 'spicy-autocomplete'
      const detect = vi.fn().mockReturnValue(configPath)
      createFreshEditorConfigMocks({[name]: {detect, format: 'jsonc'}})
      mockParseJsonc.mockReturnValue('not a config yo')
      const {detectAvailableEditors} = await import('../detectAvailableEditors.js')

      const res = await detectAvailableEditors()

      expect(detect).toHaveBeenCalled()
      expect(res).toEqual([])
    })
  })
})

import {of} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {loadStudioCliTooling, type StudioCliTooling} from '../loadStudioCliTooling.js'
import {resolveLocalPackage} from '../resolveLocalPackage.js'

vi.mock('../resolveLocalPackage.js', () => ({resolveLocalPackage: vi.fn()}))

const mockedResolveLocalPackage = vi.mocked(resolveLocalPackage)
const workDir = '/studio'

function mockStudioModules(modules: Record<string, unknown>) {
  mockedResolveLocalPackage.mockImplementation(async (name: string) => {
    if (name in modules) {
      const mod = modules[name]
      if (mod instanceof Error) throw mod
      return mod as never
    }
    throw new Error(`Unexpected package: ${name}`)
  })
}

describe('loadStudioCliTooling', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when sanity/cli provides getStudioCliTooling()', () => {
    test('returns the tooling provided by the studio without touching the root sanity exports', async () => {
      const tooling = {compileSchema: vi.fn()} as unknown as StudioCliTooling
      const getStudioCliTooling = vi.fn().mockResolvedValue(tooling)
      mockStudioModules({'sanity/cli': {getStudioCliTooling}})

      await expect(loadStudioCliTooling(workDir)).resolves.toBe(tooling)

      expect(mockedResolveLocalPackage).toHaveBeenCalledTimes(1)
      expect(mockedResolveLocalPackage).toHaveBeenCalledWith('sanity/cli', workDir)
    })

    test('supports a synchronous getStudioCliTooling()', async () => {
      const tooling = {compileSchema: vi.fn()} as unknown as StudioCliTooling
      mockStudioModules({'sanity/cli': {getStudioCliTooling: () => tooling}})

      await expect(loadStudioCliTooling(workDir)).resolves.toBe(tooling)
    })
  })

  describe.each([
    {cli: {}, name: 'sanity/cli has no getStudioCliTooling()'},
    {cli: new Error('Cannot find module'), name: 'sanity/cli cannot be loaded'},
  ])('when $name', ({cli}) => {
    test('compileSchema, createDefaultIcon and generateStudioManifest call the root sanity exports', async () => {
      const schema = {getTypeNames: () => ['document']}
      const createSchema = vi.fn().mockReturnValue(schema)
      const icon = {type: 'svg'}
      const createDefaultIcon = vi.fn().mockReturnValue(icon)
      const manifest = {workspaces: []}
      const generateStudioManifest = vi.fn().mockResolvedValue(manifest)
      mockStudioModules({
        sanity: {createDefaultIcon, createSchema, generateStudioManifest},
        'sanity/cli': cli,
      })

      const tooling = await loadStudioCliTooling(workDir)

      expect(tooling.compileSchema({name: 'default', types: []})).toBe(schema)
      expect(createSchema).toHaveBeenCalledWith({name: 'default', types: []})
      expect(tooling.createDefaultIcon('Title', 'Subtitle')).toBe(icon)
      expect(createDefaultIcon).toHaveBeenCalledWith('Title', 'Subtitle')
      const manifestOptions = {buildId: '1'} as never
      await expect(tooling.generateStudioManifest(manifestOptions)).resolves.toBe(manifest)
      expect(generateStudioManifest).toHaveBeenCalledWith(manifestOptions)
      expect(mockedResolveLocalPackage).toHaveBeenCalledWith('sanity', workDir)
    })

    test('resolveWorkspaces resolves the first value emitted by resolveConfig', async () => {
      const resolved = [{name: 'default'}]
      const resolveConfig = vi.fn().mockReturnValue(of(resolved))
      mockStudioModules({sanity: {resolveConfig}, 'sanity/cli': cli})

      const tooling = await loadStudioCliTooling(workDir)
      const input = [{name: 'default'}] as never

      await expect(tooling.resolveWorkspaces(input)).resolves.toBe(resolved)
      expect(resolveConfig).toHaveBeenCalledWith(input)
    })

    test('getSchemaValidation returns the validation of a SchemaError', async () => {
      class SchemaError extends Error {
        schema = {_validation: [{path: [], problems: []}]}
      }
      mockStudioModules({sanity: {SchemaError}, 'sanity/cli': cli})

      const tooling = await loadStudioCliTooling(workDir)
      const error = new SchemaError('invalid')

      expect(tooling.getSchemaValidation(error)).toBe(error.schema._validation)
      expect(tooling.getSchemaValidation(new Error('other'))).toBeUndefined()
    })

    test('getSchemaValidation returns undefined when sanity does not export SchemaError', async () => {
      mockStudioModules({sanity: {}, 'sanity/cli': cli})

      const tooling = await loadStudioCliTooling(workDir)

      expect(tooling.getSchemaValidation(new Error('other'))).toBeUndefined()
    })

    test.each([
      {
        call: (t: StudioCliTooling) => t.compileSchema({name: 'default', types: []}),
        name: 'createSchema',
      },
      {call: (t: StudioCliTooling) => t.createDefaultIcon('a', 'b'), name: 'createDefaultIcon'},
      {
        call: (t: StudioCliTooling) => t.generateStudioManifest({} as never),
        name: 'generateStudioManifest',
      },
      {call: (t: StudioCliTooling) => t.resolveWorkspaces([]), name: 'resolveConfig'},
    ])('throws when sanity does not export $name', async ({call, name}) => {
      mockStudioModules({sanity: {}, 'sanity/cli': cli})

      const tooling = await loadStudioCliTooling(workDir)

      await expect(async () => call(tooling)).rejects.toThrow(
        `Expected \`${name}\` from \`sanity\` to be a function`,
      )
    })
  })
})

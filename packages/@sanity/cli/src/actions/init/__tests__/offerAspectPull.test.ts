import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type MediaLibrary} from '../../../services/mediaLibraries.js'
import {offerAspectPull} from '../offerAspectPull.js'

const mockFsAccess = vi.hoisted(() => vi.fn())
const mockFsMkdir = vi.hoisted(() => vi.fn())
const mockFsReadFile = vi.hoisted(() => vi.fn())
const mockFsRm = vi.hoisted(() => vi.fn())
const mockFsWriteFile = vi.hoisted(() => vi.fn())
const mockGetAspects = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  access: mockFsAccess,
  mkdir: mockFsMkdir,
  readFile: mockFsReadFile,
  rm: mockFsRm,
  writeFile: mockFsWriteFile,
}))
vi.mock('../../../services/mediaLibraries.js', () => ({
  getAspects: mockGetAspects,
}))
vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  const spinnerStub = {
    start: () => spinnerStub,
    stop: () => spinnerStub,
  }
  return {
    ...actual,
    confirm: vi.fn(),
    spinner: () => spinnerStub,
  }
})

const mockConfirm = vi.mocked(confirm)

const LIBRARY: MediaLibrary = {id: 'lib-1', organizationId: 'org-1', status: 'active'}

const OUTPUT_PATH = path.join('/', 'projects', 'my-config')
const CONFIG_PATH = path.join(OUTPUT_PATH, 'sanity.cli.ts')
const FIELDS_DIR = path.join(OUTPUT_PATH, 'src', 'fields')

/** The sanity.cli.ts the scaffold just wrote (example fields included). */
const SCAFFOLDED_CLI_CONFIG = `import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'

export default defineCliConfig({
  app: unstable_defineMediaLibrary({
    organizationId: 'org-1',
    fields: [
      {name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},
      {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},
    ],
  }),
})
`

const CAPTION_DOC = {
  _id: 'caption',
  _type: 'sanity.asset.aspect',
  definition: {name: 'caption', title: 'Caption', type: 'string'},
}
const CREDIT_DOC = {
  _id: 'credit',
  _type: 'sanity.asset.aspect',
  definition: {name: 'credit', title: 'Credit', type: 'string'},
  public: true,
}

function mockOutput() {
  return {log: vi.fn(), warn: vi.fn()} as unknown as Output
}

describe('offerAspectPull', () => {
  beforeEach(() => {
    mockFsAccess.mockResolvedValue(undefined)
    mockFsMkdir.mockResolvedValue(undefined)
    mockFsReadFile.mockResolvedValue(SCAFFOLDED_CLI_CONFIG)
    mockFsRm.mockResolvedValue(undefined)
    mockFsWriteFile.mockResolvedValue(undefined)
    mockConfirm.mockResolvedValue(true)
  })

  afterEach(() => vi.clearAllMocks())

  test('replaces the example fields with pulled modules and rewrites sanity.cli.ts', async () => {
    mockGetAspects.mockResolvedValue([CAPTION_DOC, CREDIT_DOC])
    const output = mockOutput()

    const pulled = await offerAspectPull({library: LIBRARY, output, outputPath: OUTPUT_PATH})

    expect(pulled).toBe(true)
    expect(mockConfirm).toHaveBeenCalledWith({
      default: true,
      message:
        'Media library lib-1 already defines 2 aspects. ' +
        'Generate field modules from them (replaces the example fields)?',
    })
    // Example modules are cleared before the pulled ones are written.
    expect(mockFsRm).toHaveBeenCalledWith(FIELDS_DIR, {force: true, recursive: true})
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      path.join(FIELDS_DIR, 'caption.tsx'),
      expect.stringContaining('export default defineField({'),
    )
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      path.join(FIELDS_DIR, 'credit.tsx'),
      expect.stringContaining(`title: 'Credit'`),
    )
    // The config's fields array is replaced wholesale with the pulled entries.
    const configWrite = mockFsWriteFile.mock.calls.find(([filePath]) => filePath === CONFIG_PATH)
    expect(configWrite).toBeDefined()
    const updated = configWrite?.[1] as string
    expect(updated).toContain(
      `{name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},`,
    )
    expect(updated).toContain(
      `{name: 'credit', src: './src/fields/credit.tsx', title: 'Credit', public: true},`,
    )
    // The example entries were replaced, not appended to: `notes` is gone and
    // `caption` (same name and path as the example) appears exactly once.
    expect(updated).not.toContain(`{name: 'notes'`)
    expect(updated.match(/name: 'caption'/g)).toHaveLength(1)
    expect(vi.mocked(output.log).mock.calls.flat().join('\n')).toContain(
      'Generated 2 field modules from your media library and declared them in sanity.cli.ts',
    )
  })

  test('declining the prompt leaves the scaffold untouched', async () => {
    mockGetAspects.mockResolvedValue([CAPTION_DOC])
    mockConfirm.mockResolvedValue(false)
    const output = mockOutput()

    const pulled = await offerAspectPull({library: LIBRARY, output, outputPath: OUTPUT_PATH})

    expect(pulled).toBe(false)
    expect(mockFsRm).not.toHaveBeenCalled()
    expect(mockFsWriteFile).not.toHaveBeenCalled()
  })

  test('a library without stored aspects is a silent no-op', async () => {
    mockGetAspects.mockResolvedValue([])
    const output = mockOutput()

    const pulled = await offerAspectPull({library: LIBRARY, output, outputPath: OUTPUT_PATH})

    expect(pulled).toBe(false)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  test('lookup failures degrade to a silent skip — init must not block', async () => {
    mockGetAspects.mockRejectedValue(new Error('offline'))
    const output = mockOutput()

    const pulled = await offerAspectPull({library: LIBRARY, output, outputPath: OUTPUT_PATH})

    expect(pulled).toBe(false)
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(vi.mocked(output.warn)).not.toHaveBeenCalled()
  })

  test('unconvertible aspects are warned about, convertible ones still pulled', async () => {
    mockGetAspects.mockResolvedValue([CAPTION_DOC, {_id: 'broken', _type: 'sanity.asset.aspect'}])
    const output = mockOutput()

    const pulled = await offerAspectPull({library: LIBRARY, output, outputPath: OUTPUT_PATH})

    expect(pulled).toBe(true)
    const warnings = vi.mocked(output.warn).mock.calls.flat().join('\n')
    expect(warnings).toContain('Skipped aspect broken')
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      path.join(FIELDS_DIR, 'caption.tsx'),
      expect.any(String),
    )
  })

  test('leaves the scaffold untouched when the config cannot be edited safely', async () => {
    mockGetAspects.mockResolvedValue([CAPTION_DOC])
    mockFsReadFile.mockResolvedValue(
      `import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'\n\n` +
        `export default defineCliConfig({app: unstable_defineMediaLibrary(options)})\n`,
    )
    const output = mockOutput()

    const pulled = await offerAspectPull({library: LIBRARY, output, outputPath: OUTPUT_PATH})

    // Nothing was pulled: the example fields and their declarations are still
    // a consistent, working pair — and the caller's `!pulledAspects` branch
    // points at `sanity media pull-aspects`.
    expect(pulled).toBe(false)
    const warnings = vi.mocked(output.warn).mock.calls.flat().join('\n')
    expect(warnings).toContain('Could not seed the config from the existing aspects')
    // No filesystem changes at all: no example deletion, no module or config writes.
    expect(mockFsRm).not.toHaveBeenCalled()
    expect(mockFsWriteFile).not.toHaveBeenCalled()
  })
})

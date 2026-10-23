import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {createJiti} from 'jiti'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCliConfigSync} from '../cli/getCliConfigSync'

vi.mock('jiti', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jiti')>()
  return {...actual, createJiti: vi.fn(actual.createJiti)}
})

// Mock node:fs
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

describe('getCliConfigSync', () => {
  const mockRootPath = '/mock/project'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  test('throws error when no CLI config found', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockReturnValue(false)

    expect(() => getCliConfigSync(mockRootPath)).toThrow('No CLI config found at')
  })

  test('throws error when multiple config files found', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockReturnValue(true)

    expect(() => getCliConfigSync(mockRootPath)).toThrow('Multiple CLI config files found')
  })

  test('rejects a misplaced studioHost with instructions for fixing the config', async () => {
    const {existsSync} = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((path) => path.toString().endsWith('.ts'))
    vi.mocked(createJiti).mockReturnValueOnce((() => ({
      default: {deployment: {studioHost: 'my-studio'}},
    })) as unknown as ReturnType<typeof createJiti>)

    expect(() => getCliConfigSync(mockRootPath)).toThrow(
      'deployment.studioHost is not supported. Move studioHost to the top level',
    )
  })

  test('accepts a top-level studioHost alongside deployment settings', async () => {
    const {existsSync} = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((path) => path.toString().endsWith('.ts'))
    const config = {deployment: {autoUpdates: true}, studioHost: 'my-studio'}
    vi.mocked(createJiti).mockReturnValueOnce((() => ({default: config})) as unknown as ReturnType<
      typeof createJiti
    >)

    expect(getCliConfigSync(mockRootPath)).toEqual(config)
  })

  test('routes a branded app through the workbench loader', async () => {
    const {existsSync} = await import('node:fs')
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs')
    vi.mocked(existsSync).mockImplementation((path) => realFs.existsSync(path))

    // A self-contained config: brand the app via the global `Symbol.for` the
    // same way `defineApplication` does, so it needs no external import.
    const dir = mkdtempSync(join(tmpdir(), 'cli-sync-cfg-'))
    writeFileSync(
      join(dir, 'sanity.cli.ts'),
      [
        `const app = {name: 'drop-desk', title: 'Drop Desk'}`,
        `Object.defineProperty(app, Symbol.for('sanity.workbench.defineApp'), {`,
        `  enumerable: false, value: true,`,
        `})`,
        `export default {api: {projectId: 'abc'}, app}`,
      ].join('\n'),
    )

    try {
      const config = getCliConfigSync(dir)

      // No `sanity.config.*` in the temp dir, so it resolves to a core app —
      // proving the branch ran parseWorkbenchCliConfig and kept the brand.
      expect((config.app as {applicationType?: string}).applicationType).toBe('coreApp')
      expect(Symbol.for('sanity.workbench.defineApp') in (config.app as object)).toBe(true)
    } finally {
      rmSync(dir, {force: true, recursive: true})
    }
  })
})

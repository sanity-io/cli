import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {initNextJs} from '../initNextJs.js'
import {type InitOptions} from '../types.js'

const mockInstallNewPackages = vi.hoisted(() => vi.fn())
const mockResolvePackageManager = vi.hoisted(() => vi.fn())
const mockExeca = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))
vi.mock('../resolvePackageManager.js', () => ({
  resolvePackageManager: mockResolvePackageManager,
}))
// Partial mock: the skip message is built from the real `getAddCommand`
vi.mock('../../../util/packageManager/installPackages.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/packageManager/installPackages.js')>()),
  installNewPackages: mockInstallNewPackages,
}))

const outputLog = vi.fn()

function initOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    autoUpdates: true,
    bare: false,
    datasetDefault: false,
    fromCreate: false,
    install: true,
    mcpMode: 'skip',
    // Keeps the run offline and prompt-free: no embedded studio route means no
    // CORS origin calls, and no env append means no .env writes.
    nextjsAppendEnv: false,
    nextjsEmbedStudio: false,
    skillsMode: 'skip',
    template: 'clean',
    typescript: true,
    unattended: true,
    ...overrides,
  }
}

describe('initNextJs', () => {
  let workDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    mockResolvePackageManager.mockResolvedValue('pnpm')
    mockExeca.mockResolvedValue({exitCode: 0})
    workDir = await mkdtemp(join(tmpdir(), 'init-nextjs-'))
  })

  afterEach(async () => {
    await rm(workDir, {force: true, recursive: true})
  })

  function nextJsArgs(optionOverrides: Partial<InitOptions> = {}) {
    return {
      datasetName: 'production',
      detectedFramework: null,
      envFilename: '.env.local',
      mcpConfigured: [],
      options: initOptions(optionOverrides),
      output: {log: outputLog, warn: vi.fn()} as never,
      projectId: 'abc123',
      trace: {log: vi.fn()} as never,
      workDir,
    }
  }

  test('installs the Sanity packages by default', async () => {
    await initNextJs(nextJsArgs())

    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packageManager: 'pnpm',
        packages: expect.arrayContaining(['sanity@5', '@sanity/vision@5']),
      }),
      expect.objectContaining({workDir}),
    )
    expect(mockExeca).toHaveBeenCalledWith('pnpm', ['install', 'next-sanity@13'], expect.anything())
  })

  test('skips the install and names every package to add with install: false', async () => {
    await initNextJs(nextJsArgs({install: false}))

    expect(mockInstallNewPackages).not.toHaveBeenCalled()
    expect(mockExeca).not.toHaveBeenCalled()

    // Nothing here is declared in a scaffolded package.json, so the message has
    // to name the packages rather than point at a bare install
    const lines = outputLog.mock.calls.flat().join('\n')
    expect(lines).toContain(
      'Skipped dependency install. Run pnpm add --save-prod @sanity/vision@5 sanity@5 @sanity/image-url@2 styled-components@6 next-sanity@13 to add them.',
    )
  })

  // Package manager resolution follows the run mode alone - skipping the
  // install changes what we do with the answer, not whether we can ask for it
  test('resolves the package manager interactively even when the install is skipped', async () => {
    await initNextJs(nextJsArgs({install: false, unattended: false}))

    expect(mockResolvePackageManager).toHaveBeenCalledWith(
      expect.objectContaining({interactive: true}),
    )
  })

  test('still writes the config files when the install is skipped', async () => {
    await initNextJs(nextJsArgs({install: false}))

    const {existsSync} = await import('node:fs')
    expect(existsSync(join(workDir, 'sanity.cli.ts'))).toBe(true)
    expect(existsSync(join(workDir, 'sanity', 'schemaTypes', 'index.ts'))).toBe(true)
  })
})

import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
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
vi.mock('../../../services/cors.js', () => ({
  createCorsOrigin: vi.fn().mockResolvedValue({id: 'cors-id'}),
  listCorsOrigins: vi.fn().mockResolvedValue([]),
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

    expect(existsSync(join(workDir, 'sanity.cli.ts'))).toBe(true)
    expect(existsSync(join(workDir, 'sanity', 'schemaTypes', 'index.ts'))).toBe(true)
    expect(existsSync(join(workDir, 'app', 'studio', '[[...tool]]', 'page.tsx'))).toBe(false)
  })

  test('writes a separate Studio in the Next.js project', async () => {
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({name: 'next-app', scripts: {build: 'next build', dev: 'next dev'}}, null, 2)}\n`,
    )
    await writeFile(
      join(workDir, 'tsconfig.json'),
      `${JSON.stringify({compilerOptions: {strict: true}, exclude: ['node_modules']}, null, 2)}\n`,
    )
    await writeFile(join(workDir, '.gitignore'), 'node_modules/\n.next/\n')

    await initNextJs(nextJsArgs({install: false}))

    const config = await readFile(join(workDir, 'sanity.config.ts'), 'utf8')
    expect(config).not.toContain("'use client'")
    expect(config).not.toContain('basePath')
    expect(config).toContain("publicDir: 'sanity/static'")
    expect(config).toContain('projectId: "abc123"')
    expect(config).toContain('dataset: "production"')
    expect(config).not.toContain('NEXT_PUBLIC_')
    expect(config).not.toContain('./sanity/env')
    expect(existsSync(join(workDir, 'sanity', 'static', '.gitkeep'))).toBe(true)
    expect(existsSync(join(workDir, 'app', 'studio', '[[...tool]]', 'page.tsx'))).toBe(false)

    const cli = await readFile(join(workDir, 'sanity.cli.ts'), 'utf8')
    expect(cli).toContain('projectId: "abc123"')
    expect(cli).toContain('dataset: "production"')
    expect(cli).not.toContain('NEXT_PUBLIC_')
    expect(cli).toContain('autoUpdates: true')

    const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts).toEqual({
      build: 'next build',
      dev: 'next dev',
      studio: 'sanity dev',
      'studio:build': 'sanity build studio-static',
      'studio:deploy': 'sanity deploy',
    })

    const tsconfig = JSON.parse(await readFile(join(workDir, 'tsconfig.json'), 'utf8')) as {
      exclude: string[]
    }
    expect(tsconfig.exclude).toEqual(['node_modules', '.sanity', 'studio-static'])

    const gitignore = await readFile(join(workDir, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.sanity/')
    expect(gitignore).toContain('studio-static/')

    const lines = outputLog.mock.calls.flat().join('\n')
    expect(lines).toContain('Added a Sanity Studio to this project.')
    expect(lines).toContain('pnpm studio')
    expect(lines).not.toContain('/studio')
  })

  test('keeps an existing Studio script unless overwrite is requested', async () => {
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({scripts: {studio: 'next dev'}}, null, 2)}\n`,
    )

    await initNextJs(nextJsArgs({install: false, overwriteFiles: false}))

    const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.studio).toBe('next dev')
    expect(pkg.scripts['studio:build']).toBe('sanity build studio-static')
  })

  test('warns and leaves tsconfig unchanged when it is not valid JSON', async () => {
    const tsconfig = '{\n  // comment\n  "exclude": ["node_modules"]\n}\n'
    await writeFile(join(workDir, 'tsconfig.json'), tsconfig)

    await initNextJs(nextJsArgs({install: false}))

    expect(await readFile(join(workDir, 'tsconfig.json'), 'utf8')).toBe(tsconfig)
  })

  test('writes the legacy Next.js route only when embed is requested', async () => {
    await mkdir(join(workDir, 'app'))
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({scripts: {build: 'next build', dev: 'next dev'}}, null, 2)}\n`,
    )

    await initNextJs(nextJsArgs({install: false, nextjsEmbedStudio: true}))

    expect(existsSync(join(workDir, 'app', 'studio', '[[...tool]]', 'page.tsx'))).toBe(true)
    const config = await readFile(join(workDir, 'sanity.config.ts'), 'utf8')
    expect(config).toContain("'use client'")
    expect(config).toContain("basePath: '/studio'")
    expect(config).not.toContain('publicDir')

    const cli = await readFile(join(workDir, 'sanity.cli.ts'), 'utf8')
    expect(cli).not.toContain('autoUpdates')

    const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts).toEqual({build: 'next build', dev: 'next dev'})

    const lines = outputLog.mock.calls.flat().join('\n')
    expect(lines).toContain('The Studio is a route in the Next.js app at /studio.')
    expect(lines).not.toContain('pnpm studio')
  })
})

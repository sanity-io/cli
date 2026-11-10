import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createCorsOrigin, listCorsOrigins} from '../../../services/cors.js'
import {initInPlaceStudio} from '../initInPlaceStudio.js'
import {type InitOptions, type VersionedFramework} from '../types.js'

const mockInstallNewPackages = vi.hoisted(() => vi.fn())
const mockResolvePackageManager = vi.hoisted(() => vi.fn())
const mockExeca = vi.hoisted(() => vi.fn())
const mockGetPeerDependencies = vi.hoisted(() => vi.fn())
const mockCreateOrAppendEnvVars = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))
vi.mock('../env/createOrAppendEnvVars.js', () => ({
  createOrAppendEnvVars: mockCreateOrAppendEnvVars,
}))
vi.mock('../resolvePackageManager.js', () => ({
  resolvePackageManager: mockResolvePackageManager,
}))
// Partial mock: the skip message is built from the real `getAddCommand`
vi.mock('../../../util/packageManager/installPackages.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/packageManager/installPackages.js')>()),
  installNewPackages: mockInstallNewPackages,
}))
vi.mock('../../../util/packageManager/getPeerDependencies.js', () => ({
  getPeerDependencies: mockGetPeerDependencies,
}))
vi.mock('../../../services/cors.js', () => ({
  createCorsOrigin: vi.fn().mockResolvedValue({id: 'cors-id'}),
  listCorsOrigins: vi.fn().mockResolvedValue([]),
}))

const outputLog = vi.fn()
const outputWarn = vi.fn()

const nextjsFramework: VersionedFramework = {name: 'Next.js', slug: 'nextjs'} as VersionedFramework
const astroFramework: VersionedFramework = {name: 'Astro', slug: 'astro'} as VersionedFramework

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

describe('initInPlaceStudio', () => {
  let workDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    mockResolvePackageManager.mockResolvedValue('pnpm')
    mockExeca.mockResolvedValue({exitCode: 0})
    mockGetPeerDependencies.mockResolvedValue([])
    workDir = await mkdtemp(join(tmpdir(), 'init-in-place-studio-'))
  })

  afterEach(async () => {
    await rm(workDir, {force: true, recursive: true})
  })

  function args(
    optionOverrides: Partial<InitOptions> = {},
    overrides: {detectedFramework?: VersionedFramework | null} = {},
  ) {
    return {
      datasetName: 'production',
      detectedFramework:
        overrides.detectedFramework === undefined ? nextjsFramework : overrides.detectedFramework,
      envFilename: '.env.local',
      mcpConfigured: [],
      options: initOptions(optionOverrides),
      output: {log: outputLog, warn: outputWarn} as never,
      projectId: 'abc123',
      trace: {log: vi.fn()} as never,
      workDir,
    }
  }

  async function writeNextPackageJson() {
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({name: 'next-app', scripts: {build: 'next build', dev: 'next dev'}}, null, 2)}\n`,
    )
  }

  test('installs the Sanity packages by default', async () => {
    await initInPlaceStudio(args())

    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packageManager: 'pnpm',
        packages: expect.arrayContaining(['sanity@5', '@sanity/vision@5', '@sanity/image-url@2']),
      }),
      expect.objectContaining({workDir}),
    )
    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      {packageManager: 'pnpm', packages: ['next-sanity@13']},
      expect.objectContaining({workDir}),
    )
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('skips the install and names every package to add with install: false', async () => {
    await initInPlaceStudio(args({install: false}))

    expect(mockInstallNewPackages).not.toHaveBeenCalled()
    expect(mockExeca).not.toHaveBeenCalled()

    // Nothing here is declared in a scaffolded package.json, so the message has
    // to name the packages rather than point at a bare install
    const lines = outputLog.mock.calls.flat().join('\n')
    expect(lines).toContain(
      'Skipped dependency install. Run pnpm add --save-prod @sanity/vision@5 sanity@5 styled-components@6 @sanity/image-url@2 next-sanity@13 to add them.',
    )
  })

  // Package manager resolution follows the run mode alone - skipping the
  // install changes what we do with the answer, not whether we can ask for it
  test('resolves the package manager interactively even when the install is skipped', async () => {
    await initInPlaceStudio(args({install: false, unattended: false}))

    expect(mockResolvePackageManager).toHaveBeenCalledWith(
      expect.objectContaining({interactive: true}),
    )
  })

  test('still writes the config files when the install is skipped', async () => {
    await initInPlaceStudio(args({install: false}))

    expect(existsSync(join(workDir, 'sanity.cli.ts'))).toBe(true)
    expect(existsSync(join(workDir, 'sanity', 'schemaTypes', 'index.ts'))).toBe(true)
    expect(existsSync(join(workDir, 'app', 'studio', '[[...tool]]', 'page.tsx'))).toBe(false)
  })

  test('writes a separate Studio in the Next.js project', async () => {
    await writeNextPackageJson()
    await writeFile(
      join(workDir, 'tsconfig.json'),
      `${JSON.stringify({compilerOptions: {strict: true}, exclude: ['node_modules']}, null, 2)}\n`,
    )
    await writeFile(join(workDir, '.gitignore'), 'node_modules/\n.next/\n')

    await initInPlaceStudio(args({install: false}))

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

    // Next.js client files are written by the Next scaffold
    expect(existsSync(join(workDir, 'sanity', 'env.ts'))).toBe(true)
    expect(existsSync(join(workDir, 'sanity', 'lib', 'client.ts'))).toBe(true)

    const lines = outputLog.mock.calls.flat().join('\n')
    expect(lines).toContain('Added a Sanity Studio to this project.')
    expect(lines).toContain('The Next.js app and the Studio run on separate dev servers.')
    expect(lines).toContain('pnpm studio')
    expect(lines).not.toContain('/studio')
  })

  test('keeps an existing Studio script unless overwrite is requested', async () => {
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({scripts: {studio: 'next dev'}}, null, 2)}\n`,
    )

    await initInPlaceStudio(args({install: false, overwriteFiles: false}))

    const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.studio).toBe('next dev')
    expect(pkg.scripts['studio:build']).toBe('sanity build studio-static')
  })

  test('adds Studio excludes to a tsconfig that contains comments', async () => {
    const tsconfig = `{
  // https://nuxt.com/docs/guide/concepts/typescript
  "files": [],
  "references": [
    {
      "path": "./.nuxt/tsconfig.app.json"
    }
  ]
}
`
    await writeFile(join(workDir, 'tsconfig.json'), tsconfig)

    await initInPlaceStudio(args({install: false}))

    const updated = await readFile(join(workDir, 'tsconfig.json'), 'utf8')
    expect(updated).toContain('// https://nuxt.com/docs/guide/concepts/typescript')
    expect(updated).toContain('".sanity"')
    expect(updated).toContain('"studio-static"')
    expect(updated).toContain('"./.nuxt/tsconfig.app.json"')
    expect(outputWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("Couldn't update tsconfig.json"),
    )
  })

  test('appends Studio excludes without dropping a trailing comma', async () => {
    const tsconfig = `{
  "compilerOptions": {
    "strict": true,
  },
  "exclude": [
    "node_modules",
  ],
}
`
    await writeFile(join(workDir, 'tsconfig.json'), tsconfig)

    await initInPlaceStudio(args({install: false}))

    const updated = await readFile(join(workDir, 'tsconfig.json'), 'utf8')
    expect(updated).toContain('"node_modules",')
    expect(updated).toContain('".sanity"')
    expect(updated).toContain('"studio-static"')
    expect(updated).toMatch(/"strict": true,/)
    expect(outputWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("Couldn't update tsconfig.json"),
    )
  })

  test('warns and leaves tsconfig unchanged when it is not valid JSON', async () => {
    const tsconfig = '{not json\n'
    await writeFile(join(workDir, 'tsconfig.json'), tsconfig)

    await initInPlaceStudio(args({install: false}))

    expect(await readFile(join(workDir, 'tsconfig.json'), 'utf8')).toBe(tsconfig)
    expect(outputWarn).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't update tsconfig.json"),
    )
  })

  test('writes the legacy Next.js route only when embed is requested', async () => {
    await mkdir(join(workDir, 'app'))
    await writeFile(
      join(workDir, 'package.json'),
      `${JSON.stringify({scripts: {build: 'next build', dev: 'next dev'}}, null, 2)}\n`,
    )

    await initInPlaceStudio(args({install: false, nextjsEmbedStudio: true}))

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

  test('writes the blog schema and its icon package', async () => {
    await writeNextPackageJson()

    await initInPlaceStudio(args({install: true, template: 'blog'}))

    const structure = await readFile(join(workDir, 'sanity', 'structure.ts'), 'utf8')
    expect(structure).toContain(".title('Blog')")
    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      expect.objectContaining({packages: expect.arrayContaining(['@sanity/icons@5'])}),
      expect.anything(),
    )
  })

  test('writes JavaScript files when TypeScript is not selected', async () => {
    await writeNextPackageJson()

    await initInPlaceStudio(args({install: false, typescript: false}))

    expect(existsSync(join(workDir, 'sanity.config.js'))).toBe(true)
    expect(existsSync(join(workDir, 'sanity', 'schemaTypes', 'index.js'))).toBe(true)
    expect(existsSync(join(workDir, 'sanity', 'env.js'))).toBe(true)
  })

  test('appends the project ID and dataset to the env file when asked to', async () => {
    await writeNextPackageJson()
    await initInPlaceStudio(args({install: false, nextjsAppendEnv: true}))

    expect(mockCreateOrAppendEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: {DATASET: 'production', PROJECT_ID: 'abc123'},
        filename: '.env.local',
      }),
    )
  })

  test('adds the dev origin to CORS when it is not already allowed', async () => {
    await writeNextPackageJson()

    await initInPlaceStudio(args({install: false}))

    expect(createCorsOrigin).toHaveBeenCalledWith({
      allowCredentials: true,
      origin: 'http://localhost:3000',
      projectId: 'abc123',
    })
  })

  test('skips adding the dev origin when it is already allowed', async () => {
    vi.mocked(listCorsOrigins).mockResolvedValueOnce([{origin: 'http://localhost:3000'} as never])
    await writeNextPackageJson()

    await initInPlaceStudio(args({install: false}))

    expect(createCorsOrigin).not.toHaveBeenCalled()
  })

  test('installs the client package with npm', async () => {
    mockResolvePackageManager.mockResolvedValueOnce('npm')
    await writeNextPackageJson()

    await initInPlaceStudio(args())

    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      {packageManager: 'npm', packages: ['next-sanity@13']},
      expect.objectContaining({workDir}),
    )
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('installs the client package and its peers with yarn', async () => {
    mockResolvePackageManager.mockResolvedValueOnce('yarn')
    mockGetPeerDependencies.mockResolvedValueOnce(['react@19'])
    await writeNextPackageJson()

    await initInPlaceStudio(args())

    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      {packageManager: 'yarn', packages: ['next-sanity@13', 'react@19']},
      expect.objectContaining({workDir}),
    )
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('leaves the client package to bun and manual installs', async () => {
    mockResolvePackageManager.mockResolvedValueOnce('bun')
    await writeNextPackageJson()

    await initInPlaceStudio(args())

    expect(mockExeca).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['next-sanity@13']),
      expect.anything(),
    )
  })

  describe('framework without a client scaffold', () => {
    test('adds a Studio without client files, env, or CORS', async () => {
      await writeFile(
        join(workDir, 'package.json'),
        `${JSON.stringify({name: 'astro-app', scripts: {dev: 'astro dev'}}, null, 2)}\n`,
      )

      await initInPlaceStudio(args({install: true}, {detectedFramework: astroFramework}))

      expect(existsSync(join(workDir, 'sanity.config.ts'))).toBe(true)
      expect(existsSync(join(workDir, 'sanity.cli.ts'))).toBe(true)
      expect(existsSync(join(workDir, 'sanity', 'schemaTypes', 'index.ts'))).toBe(true)
      expect(existsSync(join(workDir, 'sanity', 'static', '.gitkeep'))).toBe(true)

      expect(existsSync(join(workDir, 'sanity', 'env.ts'))).toBe(false)
      expect(existsSync(join(workDir, 'sanity', 'lib'))).toBe(false)
      expect(existsSync(join(workDir, 'app', 'studio'))).toBe(false)

      const config = await readFile(join(workDir, 'sanity.config.ts'), 'utf8')
      expect(config).not.toContain('NEXT_PUBLIC_')

      // Studio packages only, no Next client or image helpers
      expect(mockInstallNewPackages).toHaveBeenCalledWith(
        {
          packageManager: 'pnpm',
          packages: ['@sanity/vision@5', 'sanity@5', 'styled-components@6'],
        },
        expect.objectContaining({workDir}),
      )
      expect(mockExeca).not.toHaveBeenCalled()
      expect(listCorsOrigins).not.toHaveBeenCalled()
      expect(createCorsOrigin).not.toHaveBeenCalled()

      const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>
      }
      expect(pkg.scripts).toEqual({
        dev: 'astro dev',
        studio: 'sanity dev',
        'studio:build': 'sanity build studio-static',
        'studio:deploy': 'sanity deploy',
      })

      const lines = outputLog.mock.calls.flat().join('\n')
      expect(lines).toContain('Added a Sanity Studio to this project.')
      expect(lines).toContain('The Astro app and the Studio run on separate dev servers.')
      expect(lines).toContain('pnpm studio')
    })

    test('adds a Studio when no framework is detected', async () => {
      await writeFile(
        join(workDir, 'package.json'),
        `${JSON.stringify({name: 'custom-app', scripts: {dev: 'node server.js'}}, null, 2)}\n`,
      )

      await initInPlaceStudio(args({install: false}, {detectedFramework: null}))

      expect(existsSync(join(workDir, 'sanity.config.ts'))).toBe(true)
      expect(existsSync(join(workDir, 'sanity', 'env.ts'))).toBe(false)
      expect(listCorsOrigins).not.toHaveBeenCalled()

      const lines = outputLog.mock.calls.flat().join('\n')
      expect(lines).toContain('Added a Sanity Studio to this project.')
      expect(lines).toContain('The app and the Studio run on separate dev servers.')
      expect(lines).toContain('Skipped dependency install.')
    })

    test('warns that the embedded route is Next.js only and adds the Studio', async () => {
      await writeFile(join(workDir, 'package.json'), `${JSON.stringify({name: 'astro-app'})}\n`)

      await initInPlaceStudio(
        args({install: false, nextjsEmbedStudio: true}, {detectedFramework: astroFramework}),
      )

      expect(outputWarn).toHaveBeenCalledWith(
        expect.stringContaining('--nextjs-embed-studio is only available for Next.js projects'),
      )
      expect(existsSync(join(workDir, 'sanity.config.ts'))).toBe(true)
      expect(existsSync(join(workDir, 'app'))).toBe(false)
      expect(existsSync(join(workDir, 'src', 'app'))).toBe(false)
    })
  })
})

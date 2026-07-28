import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  existingScaffoldEnvFiles,
  FRONTEND_DIR,
  FRONTEND_ENV_FILE,
  scaffoldProject,
  STUDIO_DIR,
  STUDIO_ENV_FILE,
} from '../scaffoldProject.js'

const mockInitStudio = vi.hoisted(() => vi.fn())
const mockCreateFrontend = vi.hoisted(() => vi.fn())
const mockInstallFrontendDeps = vi.hoisted(() => vi.fn())
const mockDetectFrameworkRecord = vi.hoisted(() => vi.fn())
const mockAppendEnvValues = vi.hoisted(() => vi.fn())
const mockResolvePackageManager = vi.hoisted(() => vi.fn())
const mockGetProjectDefaults = vi.hoisted(() => vi.fn())

vi.mock('../../init/initStudio.js', () => ({initStudio: mockInitStudio}))
vi.mock('../createFrontend.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../createFrontend.js')>()),
  createFrontend: mockCreateFrontend,
  installFrontendDeps: mockInstallFrontendDeps,
}))
vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: mockDetectFrameworkRecord,
}))
vi.mock('../../../util/envFile.js', () => ({appendEnvValues: mockAppendEnvValues}))
vi.mock('../../init/resolvePackageManager.js', () => ({
  resolvePackageManager: mockResolvePackageManager,
}))
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: mockGetProjectDefaults,
}))

const trace = {complete: vi.fn(), error: vi.fn(), log: vi.fn(), newContext: vi.fn(), start: vi.fn()}

const output = {
  error: vi.fn(),
  log: vi.fn(),
  print: vi.fn(),
  spinner: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
} as never

const telemetry = {trace: () => trace} as never

const workDir = '/tmp/my-project'

const args = {
  dataset: 'production',
  displayName: 'My Project',
  output,
  projectId: 'abc123',
  telemetry,
  token: 'sk-robot-token',
  workDir,
}

function envWriteFor(file: string) {
  return mockAppendEnvValues.mock.calls.find(([envPath]) => envPath === file)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDetectFrameworkRecord.mockResolvedValue(null)
  mockResolvePackageManager.mockResolvedValue('npm')
  mockGetProjectDefaults.mockResolvedValue({projectName: 'My Project'})
  mockInitStudio.mockResolvedValue(undefined)
  mockCreateFrontend.mockResolvedValue(undefined)
  mockInstallFrontendDeps.mockResolvedValue(undefined)
  mockAppendEnvValues.mockReturnValue({created: true, skippedKeys: [], wroteKeys: []})
})

describe('scaffoldProject', () => {
  test('scaffolds a Studio and a frontend as siblings of the minted directory', async () => {
    const result = await scaffoldProject(args)

    expect(result.studioPath).toBe(path.join(workDir, STUDIO_DIR))
    expect(result.frontendPath).toBe(path.join(workDir, FRONTEND_DIR))
    expect(result.detectedFramework).toBeUndefined()
    expect(result.warnings).toEqual([])
    expect(mockCreateFrontend).toHaveBeenCalledWith(
      expect.objectContaining({dirName: FRONTEND_DIR, workDir}),
    )
  })

  test('drives the Studio scaffold with the minted project and no account lookups', async () => {
    await scaffoldProject(args)

    const [call] = mockInitStudio.mock.calls
    expect(call[0]).toMatchObject({
      datasetName: 'production',
      outputPath: path.join(workDir, STUDIO_DIR),
      preclaim: true,
      projectId: 'abc123',
    })
    expect(call[0].options).toMatchObject({
      git: false,
      mcpMode: 'skip',
      project: 'abc123',
      skillsMode: 'skip',
      template: 'clean',
      unattended: true,
    })
  })

  test('puts the token in the Studio .env.local only, and never in .env', async () => {
    await scaffoldProject(args)

    const studioEnv = envWriteFor(path.join(workDir, STUDIO_DIR, '.env.local'))
    const frontendEnv = envWriteFor(path.join(workDir, FRONTEND_DIR, '.env.local'))

    expect(studioEnv?.[1]).toEqual({SANITY_AUTH_TOKEN: 'sk-robot-token'})
    expect(frontendEnv?.[1]).toEqual({
      NEXT_PUBLIC_SANITY_DATASET: 'production',
      NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
    })
    const wroteToPlainEnv = mockAppendEnvValues.mock.calls.some(([envPath]) =>
      String(envPath).endsWith(`${path.sep}.env`),
    )
    expect(wroteToPlainEnv).toBe(false)
  })

  test('writes the token to exactly one file, and never under a browser-exposed prefix', async () => {
    await scaffoldProject(args)

    const filesWithToken = mockAppendEnvValues.mock.calls
      .filter(([, values]) =>
        Object.values(values as Record<string, string>).includes('sk-robot-token'),
      )
      .map(([envPath]) => String(envPath))
    expect(filesWithToken).toEqual([path.join(workDir, STUDIO_DIR, '.env.local')])

    const exposed = mockAppendEnvValues.mock.calls.flatMap(([, values]) =>
      Object.entries(values as Record<string, string>).filter(
        ([key, value]) =>
          value === 'sk-robot-token' &&
          (key.startsWith('NEXT_PUBLIC_') ||
            key.startsWith('SANITY_STUDIO_') ||
            key.startsWith('PUBLIC_') ||
            key.startsWith('VITE_')),
      ),
    )

    expect(exposed).toEqual([])
  })

  test('leaves an existing app alone but still scaffolds the Studio beside it', async () => {
    mockDetectFrameworkRecord.mockResolvedValue({name: 'Next.js', slug: 'nextjs'})

    const result = await scaffoldProject(args)

    expect(mockCreateFrontend).not.toHaveBeenCalled()
    expect(mockInitStudio).toHaveBeenCalled()
    expect(result.detectedFramework).toBe('Next.js')
    expect(result.frontendPath).toBeUndefined()
    expect(result.frontendEnv).toEqual({
      NEXT_PUBLIC_SANITY_DATASET: 'production',
      NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
    })
    expect(envWriteFor(path.join(workDir, FRONTEND_DIR, '.env.local'))).toBeUndefined()
  })

  test('a framework that is not Next.js also keeps the frontend untouched', async () => {
    mockDetectFrameworkRecord.mockResolvedValue({name: 'Astro', slug: 'astro'})

    const result = await scaffoldProject(args)

    expect(mockCreateFrontend).not.toHaveBeenCalled()
    expect(result.detectedFramework).toBe('Astro')
  })

  test('keeps the Studio when the frontend scaffold fails, and reports it', async () => {
    const {FrontendScaffoldError} = await import('../createFrontend.js')
    mockCreateFrontend.mockRejectedValue(new FrontendScaffoldError('create-next-app failed: boom'))

    const result = await scaffoldProject(args)

    expect(result.studioPath).toBe(path.join(workDir, STUDIO_DIR))
    expect(result.frontendPath).toBeUndefined()
    expect(result.warnings).toEqual([expect.stringContaining('create-next-app failed: boom')])
    expect(envWriteFor(path.join(workDir, STUDIO_DIR, '.env.local'))).toBeDefined()
  })

  test('records a non-Error Studio failure as an Error on the trace, and rethrows', async () => {
    mockInitStudio.mockRejectedValue('worker died')

    await expect(scaffoldProject(args)).rejects.toBe('worker died')
    expect(trace.error).toHaveBeenCalledWith(expect.any(Error))
  })

  test('propagates an unexpected frontend error rather than swallowing it', async () => {
    mockCreateFrontend.mockRejectedValue(new Error('disk full'))

    await expect(scaffoldProject(args)).rejects.toThrow('disk full')
  })

  test('propagates frontend cancellation without writing frontend configuration', async () => {
    const controller = new AbortController()
    mockCreateFrontend.mockImplementation(async () => {
      controller.abort(new Error('SIGINT'))
      controller.signal.throwIfAborted()
    })

    await expect(scaffoldProject({...args, cancelSignal: controller.signal})).rejects.toThrow(
      'SIGINT',
    )

    expect(envWriteFor(path.join(workDir, FRONTEND_DIR, '.env.local'))).toBeUndefined()
    expect(mockInstallFrontendDeps).not.toHaveBeenCalled()
  })

  test('writes the frontend env before installing, so a failed install keeps it configured', async () => {
    const {FrontendScaffoldError} = await import('../createFrontend.js')
    mockInstallFrontendDeps.mockRejectedValue(
      new FrontendScaffoldError('Installing next-sanity failed: registry down'),
    )

    const result = await scaffoldProject(args)

    expect(result.frontendPath).toBe(path.join(workDir, FRONTEND_DIR))
    expect(envWriteFor(path.join(workDir, FRONTEND_DIR, '.env.local'))).toBeDefined()
    expect(result.warnings).toEqual([expect.stringContaining('Installing next-sanity failed')])
  })

  test('the non-FrontendScaffoldError guard rethrows (defensive: installFrontendDeps wraps all)', async () => {
    mockInstallFrontendDeps.mockRejectedValue(new Error('segfault'))

    await expect(scaffoldProject(args)).rejects.toThrow('segfault')
  })

  test('propagates dependency installation cancellation', async () => {
    const controller = new AbortController()
    mockInstallFrontendDeps.mockImplementation(async () => {
      controller.abort(new Error('SIGINT'))
      controller.signal.throwIfAborted()
    })

    await expect(scaffoldProject({...args, cancelSignal: controller.signal})).rejects.toThrow(
      'SIGINT',
    )
  })

  test('a failed Studio env write degrades to a warning instead of unwinding the mint', async () => {
    mockAppendEnvValues.mockImplementation((envPath: string) => {
      if (String(envPath).includes(STUDIO_DIR)) throw new Error('EACCES')
      return {created: true, skippedKeys: [], wroteKeys: []}
    })

    const result = await scaffoldProject(args)

    expect(result.studioPath).toBe(path.join(workDir, STUDIO_DIR))
    expect(result.warnings).toEqual([
      expect.stringContaining(`Couldn't write ${STUDIO_DIR}/.env.local`),
    ])
  })

  test('a pre-existing blank key counts as not written, not as success', async () => {
    mockAppendEnvValues.mockImplementation((envPath: string) => ({
      created: false,
      skippedKeys: String(envPath).includes(FRONTEND_DIR) ? ['NEXT_PUBLIC_SANITY_PROJECT_ID'] : [],
      wroteKeys: [],
    }))

    const result = await scaffoldProject(args)

    expect(result.frontendEnvWritten).toBe(false)
    expect(result.warnings).toEqual([
      expect.stringContaining(`Couldn't write ${FRONTEND_DIR}/.env.local`),
    ])
  })

  test('a failed frontend env write is reported, not thrown', async () => {
    mockAppendEnvValues.mockImplementation((envPath: string) => {
      if (String(envPath).includes(FRONTEND_DIR)) throw new Error('EACCES')
      return {created: true, skippedKeys: [], wroteKeys: []}
    })

    const result = await scaffoldProject(args)

    expect(result.warnings).toEqual([
      expect.stringContaining(`Couldn't write ${FRONTEND_DIR}/.env.local`),
    ])
  })

  test('records a failed Studio scaffold on the telemetry trace and rethrows', async () => {
    mockInitStudio.mockRejectedValue(new Error('template missing'))

    await expect(scaffoldProject(args)).rejects.toThrow('template missing')

    expect(trace.error).toHaveBeenCalledWith(expect.any(Error))
    expect(trace.complete).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    expect(mockCreateFrontend).not.toHaveBeenCalled()
  })

  test('passes a detected package manager through to both scaffolders', async () => {
    mockResolvePackageManager.mockResolvedValue('pnpm')

    await scaffoldProject(args)

    expect(mockInitStudio.mock.calls[0][0].options).toMatchObject({packageManager: 'pnpm'})
    expect(mockCreateFrontend).toHaveBeenCalledWith(
      expect.objectContaining({packageManager: 'pnpm'}),
    )
  })

  test('leaves the Studio package manager unset for managers init cannot drive', async () => {
    mockResolvePackageManager.mockResolvedValue('bun')

    await scaffoldProject(args)

    expect(mockInitStudio.mock.calls[0][0].options.packageManager).toBeUndefined()
    expect(mockCreateFrontend).toHaveBeenCalledWith(
      expect.objectContaining({packageManager: 'bun'}),
    )
  })
})

function scaffoldEnvTree(dirs: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'scaffold-env-'))
  for (const dir of dirs) {
    mkdirSync(path.join(root, dir), {recursive: true})
    writeFileSync(path.join(root, dir, '.env.local'), 'SANITY_AUTH_TOKEN="old"\n')
  }
  return root
}

describe('existingScaffoldEnvFiles', () => {
  test('reports only the scaffolded env files that exist', () => {
    expect(existingScaffoldEnvFiles(scaffoldEnvTree([STUDIO_DIR, FRONTEND_DIR]))).toEqual([
      STUDIO_ENV_FILE,
      FRONTEND_ENV_FILE,
    ])
    expect(existingScaffoldEnvFiles(scaffoldEnvTree([FRONTEND_DIR]))).toEqual([FRONTEND_ENV_FILE])
    expect(existingScaffoldEnvFiles(scaffoldEnvTree([]))).toEqual([])
  })

  test('names them with forward slashes, which callers key guidance off', () => {
    // A `path.join` here yields backslashes on Windows, and every caller that looks these paths up
    // by name silently finds nothing.
    expect([STUDIO_ENV_FILE, FRONTEND_ENV_FILE]).toEqual(['sanity/.env.local', 'web/.env.local'])
    expect(existingScaffoldEnvFiles(scaffoldEnvTree([STUDIO_DIR]))).toEqual([
      expect.not.stringContaining('\\'),
    ])
  })
})

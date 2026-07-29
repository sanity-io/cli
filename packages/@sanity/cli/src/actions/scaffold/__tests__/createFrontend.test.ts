import path from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createFrontend,
  frontendScaffoldCommand,
  FrontendScaffoldError,
  installFrontendDeps,
} from '../createFrontend.js'

const mockExeca = vi.hoisted(() => vi.fn())
const mockInstallNewPackages = vi.hoisted(() => vi.fn())
const mockProgress = vi.hoisted(() => ({fail: vi.fn(), succeed: vi.fn()}))

vi.mock('execa', () => ({execa: mockExeca}))
vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => ({start: () => mockProgress})),
}))
vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installNewPackages: mockInstallNewPackages,
}))
vi.mock('../../../util/packageManager/packageManagerChoice.js', () => ({
  getPartialEnvWithNpmPath: vi.fn(() => ({PATH: '/usr/bin'})),
}))

const mockOutputLog = vi.fn()
const output = {log: mockOutputLog} as never

beforeEach(() => {
  vi.clearAllMocks()
  mockExeca.mockResolvedValue({exitCode: 0, failed: false, stderr: '', stdout: ''})
  mockInstallNewPackages.mockResolvedValue(undefined)
})

describe('frontendScaffoldCommand', () => {
  test('returns a fully non-interactive create-next-app command', () => {
    expect(frontendScaffoldCommand('web')).toContain(
      'npx --yes create-next-app@^16 web --typescript --app --eslint --tailwind --no-src-dir --disable-git --yes',
    )
  })
})

describe('createFrontend', () => {
  test('runs create-next-app with the selected package manager and bounded execution', async () => {
    await createFrontend({
      dirName: 'web',
      output,
      packageManager: 'pnpm',
      workDir: '/tmp/project',
    })

    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['create-next-app@^16', 'web', '--use-pnpm']),
      expect.objectContaining({
        cwd: '/tmp/project',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 600_000,
      }),
    )
    expect(mockProgress.succeed).toHaveBeenCalled()
  })

  test('turns scaffolder failures into an actionable typed error', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      failed: true,
      stderr: 'failure details',
      stdout: '',
    })

    await expect(
      createFrontend({
        dirName: 'web',
        output,
        packageManager: 'npm',
        workDir: '/tmp/project',
      }),
    ).rejects.toBeInstanceOf(FrontendScaffoldError)

    expect(mockOutputLog).toHaveBeenCalledWith('failure details')
    expect(mockProgress.fail).toHaveBeenCalled()
  })
})

describe('installFrontendDeps', () => {
  test('installs next-sanity in the generated frontend with the same timeout', async () => {
    await installFrontendDeps({
      dirName: 'web',
      output,
      packageManager: 'npm',
      workDir: '/tmp/project',
    })

    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      {packageManager: 'npm', packages: ['next-sanity']},
      expect.objectContaining({
        output,
        timeout: 600_000,
        workDir: path.join('/tmp/project', 'web'),
      }),
    )
  })
})

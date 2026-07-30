import path from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createFrontend, FrontendScaffoldError, installFrontendDeps} from '../createFrontend.js'

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

  test('turns a missing scaffolder result into a typed error', async () => {
    mockExeca.mockResolvedValue(undefined)

    await expect(
      createFrontend({
        dirName: 'web',
        output,
        packageManager: 'npm',
        workDir: '/tmp/project',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'create-next-app failed',
        name: 'FrontendScaffoldError',
      }),
    )

    expect(mockProgress.fail).toHaveBeenCalled()
    expect(mockProgress.succeed).not.toHaveBeenCalled()
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

  test('wraps installer exit errors for partial scaffold recovery', async () => {
    mockInstallNewPackages.mockRejectedValue(new Error('Package installation failed'))

    await expect(
      installFrontendDeps({
        dirName: 'web',
        output,
        packageManager: 'npm',
        workDir: '/tmp/project',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'Installing next-sanity failed: Package installation failed',
        name: 'FrontendScaffoldError',
      }),
    )
  })
})

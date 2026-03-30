import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import spawn from 'nano-spawn'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {installDeclaredPackages, installNewPackages} from '../installPackages.js'
import {getPartialEnvWithNpmPath} from '../packageManagerChoice.js'

// Mock external dependencies
vi.mock('nano-spawn', () => ({
  default: vi.fn(),
}))

vi.mock('../packageManagerChoice.js', () => ({
  getPartialEnvWithNpmPath: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    spinner: vi.fn(() => ({
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    })),
  }
})

const mockSpawn = vi.mocked(spawn)
const mockSpinner = vi.mocked(spinner)
const mockGetPartialEnvWithNpmPath = vi.mocked(getPartialEnvWithNpmPath)

const mockOutput: Output = {
  error: vi.fn() as never,
  log: vi.fn(),
  warn: vi.fn(),
}

const mockSpinnerInstance = {
  fail: vi.fn().mockReturnThis(),
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
  mockSpinner.mockReturnValue(mockSpinnerInstance as never)
})

describe('installDeclaredPackages', () => {
  const workDir = '/test/project'
  const context = {output: mockOutput, workDir}

  test('installs with npm successfully', async () => {
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installDeclaredPackages(workDir, 'npm', context)

    expect(spawn).toHaveBeenCalledWith('npm', ['install'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockSpinnerInstance.fail).not.toHaveBeenCalled()
  })

  test('installs with yarn successfully', async () => {
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installDeclaredPackages(workDir, 'yarn', context)

    expect(spawn).toHaveBeenCalledWith('yarn', ['install'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs with pnpm successfully', async () => {
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(spawn).toHaveBeenCalledWith('pnpm', ['install'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs with bun successfully', async () => {
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installDeclaredPackages(workDir, 'bun', context)

    expect(spawn).toHaveBeenCalledWith('bun', ['install'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('handles manual package manager', async () => {
    await installDeclaredPackages(workDir, 'manual', context)

    expect(spawn).not.toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith(
      "Manual installation selected — run 'npm install' or equivalent",
    )
  })

  test('handles installation failure with exit code', async () => {
    const error = Object.assign(new Error('Command failed'), {
      exitCode: 1,
      stderr: '',
      stdout: 'Error: Package not found',
    })
    mockSpawn.mockRejectedValueOnce(error)

    await expect(installDeclaredPackages(workDir, 'npm', context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Error: Package not found')
    expect(mockOutput.error).toHaveBeenCalledWith('Dependency installation failed', {exit: 1})
  })

  test('handles installation failure with failed flag', async () => {
    const error = Object.assign(new Error('Command failed'), {
      exitCode: 1,
      stderr: '',
      stdout: 'Command failed',
    })
    mockSpawn.mockRejectedValueOnce(error)

    await expect(installDeclaredPackages(workDir, 'npm', context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Command failed')
    expect(mockOutput.error).toHaveBeenCalledWith('Dependency installation failed', {exit: 1})
  })
})

describe('installNewPackages', () => {
  const workDir = '/test/project'
  const context = {output: mockOutput, workDir}

  test('installs single package with npm successfully', async () => {
    const options = {packageManager: 'npm' as const, packages: ['@sanity/vision']}
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installNewPackages(options, context)

    expect(spawn).toHaveBeenCalledWith('npm', ['install', '--save', '@sanity/vision'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs multiple packages with yarn successfully', async () => {
    const options = {
      packageManager: 'yarn' as const,
      packages: ['@sanity/vision', 'react-icons'],
    }
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installNewPackages(options, context)

    expect(spawn).toHaveBeenCalledWith('yarn', ['add', '@sanity/vision', 'react-icons'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs packages with pnpm successfully', async () => {
    const options = {packageManager: 'pnpm' as const, packages: ['lodash']}
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installNewPackages(options, context)

    expect(spawn).toHaveBeenCalledWith('pnpm', ['add', '--save-prod', 'lodash'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs packages with bun successfully', async () => {
    const options = {packageManager: 'bun' as const, packages: ['express']}
    mockSpawn.mockResolvedValueOnce({stdout: 'Installation successful'} as never)

    await installNewPackages(options, context)

    expect(spawn).toHaveBeenCalledWith('bun', ['add', 'express'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('handles manual package manager for new packages', async () => {
    const options = {packageManager: 'manual' as const, packages: ['some-package']}

    await installNewPackages(options, context)

    expect(spawn).not.toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith(
      "Manual installation selected - run 'npm install --save some-package' or equivalent",
    )
  })

  test('handles installation failure with error output', async () => {
    const options = {packageManager: 'npm' as const, packages: ['nonexistent-package']}
    const error = Object.assign(new Error('Command failed'), {
      exitCode: 1,
      stderr: '',
      stdout: 'Error: Package not found',
    })
    mockSpawn.mockRejectedValueOnce(error)

    await expect(installNewPackages(options, context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Error: Package not found')
    expect(mockOutput.error).toHaveBeenCalledWith('Package installation failed', {exit: 1})
  })

  test('handles installation failure with failed flag', async () => {
    const options = {packageManager: 'pnpm' as const, packages: ['failing-package']}
    const error = Object.assign(new Error('Command failed'), {
      exitCode: 1,
      stderr: '',
      stdout: 'Command execution failed',
    })
    mockSpawn.mockRejectedValueOnce(error)

    await expect(installNewPackages(options, context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Command execution failed')
    expect(mockOutput.error).toHaveBeenCalledWith('Package installation failed', {exit: 1})
  })

  test('handles empty packages array', async () => {
    const options = {packageManager: 'npm' as const, packages: []}
    mockSpawn.mockResolvedValueOnce({stdout: 'Nothing to install'} as never)

    await installNewPackages(options, context)

    expect(spawn).toHaveBeenCalledWith('npm', ['install', '--save'], {
      cwd: workDir,
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })
})

describe('error handling edge cases', () => {
  const workDir = '/test/project'
  const context = {output: mockOutput, workDir}

  test('handles successful resolve in installDeclaredPackages', async () => {
    mockSpawn.mockResolvedValueOnce({stdout: ''} as never)

    await installDeclaredPackages(workDir, 'npm', context)

    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('handles successful resolve in installNewPackages', async () => {
    const options = {packageManager: 'npm' as const, packages: ['test']}
    mockSpawn.mockResolvedValueOnce({stdout: ''} as never)

    await installNewPackages(options, context)

    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })
})

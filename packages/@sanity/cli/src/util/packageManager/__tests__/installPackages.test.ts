import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {execa, type Result} from 'execa'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {installDeclaredPackages, installNewPackages} from '../installPackages.js'
import {getPartialEnvWithNpmPath} from '../packageManagerChoice.js'

// Mock external dependencies
vi.mock('execa', () => ({
  execa: vi.fn(),
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

const mockExeca = vi.mocked(execa)
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
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'npm', context)

    expect(execa).toHaveBeenCalledWith('npm', ['install'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockSpinnerInstance.fail).not.toHaveBeenCalled()
  })

  test('installs with yarn successfully', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'yarn', context)

    expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs with pnpm successfully', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(execa).toHaveBeenCalledWith('pnpm', ['install'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs with bun successfully', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'bun', context)

    expect(execa).toHaveBeenCalledWith('bun', ['install'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('handles manual package manager', async () => {
    await installDeclaredPackages(workDir, 'manual', context)

    expect(execa).not.toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith(
      "Manual installation selected — run 'npm install' or equivalent",
    )
  })

  test('handles installation failure with exit code', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stdout: 'Error: Package not found',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'npm', context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Error: Package not found')
    expect(mockOutput.error).toHaveBeenCalledWith('Dependency installation failed', {exit: 1})
  })

  test('handles installation failure with failed flag', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: true,
      stdout: 'Command failed',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

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
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installNewPackages(options, context)

    expect(execa).toHaveBeenCalledWith('npm', ['install', '--save', '@sanity/vision'], {
      cwd: workDir,
      encoding: 'utf8',
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
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installNewPackages(options, context)

    expect(execa).toHaveBeenCalledWith('yarn', ['add', '@sanity/vision', 'react-icons'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs packages with pnpm successfully', async () => {
    const options = {packageManager: 'pnpm' as const, packages: ['lodash']}
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installNewPackages(options, context)

    expect(execa).toHaveBeenCalledWith('pnpm', ['add', '--save-prod', 'lodash'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('installs packages with bun successfully', async () => {
    const options = {packageManager: 'bun' as const, packages: ['express']}
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Installation successful',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installNewPackages(options, context)

    expect(execa).toHaveBeenCalledWith('bun', ['add', 'express'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('handles manual package manager for new packages', async () => {
    const options = {packageManager: 'manual' as const, packages: ['some-package']}

    await installNewPackages(options, context)

    expect(execa).not.toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith(
      "Manual installation selected - run 'npm install --save some-package' or equivalent",
    )
  })

  test('handles installation failure with error output', async () => {
    const options = {packageManager: 'npm' as const, packages: ['nonexistent-package']}
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stdout: 'Error: Package not found',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installNewPackages(options, context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Error: Package not found')
    expect(mockOutput.error).toHaveBeenCalledWith('Package installation failed', {exit: 1})
  })

  test('handles installation failure with failed flag', async () => {
    const options = {packageManager: 'pnpm' as const, packages: ['failing-package']}
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: true,
      stdout: 'Command execution failed',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installNewPackages(options, context))

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Command execution failed')
    expect(mockOutput.error).toHaveBeenCalledWith('Package installation failed', {exit: 1})
  })

  test('handles empty packages array', async () => {
    const options = {packageManager: 'npm' as const, packages: []}
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: false,
      stdout: 'Nothing to install',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installNewPackages(options, context)

    expect(execa).toHaveBeenCalledWith('npm', ['install', '--save'], {
      cwd: workDir,
      encoding: 'utf8',
      env: {PATH: '/mock/path'},
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })
})

describe('error handling edge cases', () => {
  const workDir = '/test/project'
  const context = {output: mockOutput, workDir}

  test('handles undefined result in installDeclaredPackages', async () => {
    mockExeca.mockResolvedValueOnce(undefined as unknown as Result)

    await installDeclaredPackages(workDir, 'npm', context)

    // Should not throw if result is undefined and no error conditions
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('handles undefined result in installNewPackages', async () => {
    const options = {packageManager: 'npm' as const, packages: ['test']}
    mockExeca.mockResolvedValueOnce(undefined as unknown as Result)

    await installNewPackages(options, context)

    // Should not throw if result is undefined and no error conditions
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })
})

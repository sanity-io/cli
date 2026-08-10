import {exitCodes, type Output} from '@sanity/cli-core'
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
      stop: vi.fn().mockReturnThis(),
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
  stop: vi.fn().mockReturnThis(),
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
      reject: false,
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockSpinnerInstance.fail).not.toHaveBeenCalled()
    expect(mockSpinner).toHaveBeenCalledWith({
      discardStdin: true,
      text: 'Running npm install\n',
    })
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
      reject: false,
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
      reject: false,
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
      reject: false,
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

    await expect(installDeclaredPackages(workDir, 'npm', context)).rejects.toMatchObject({
      message: 'Dependency installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Error: Package not found')
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('handles installation failure with failed flag', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: true,
      stdout: 'Command failed',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'npm', context)).rejects.toMatchObject({
      message: 'Dependency installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Command failed')
    expect(mockOutput.error).not.toHaveBeenCalled()
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
      reject: false,
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.start).toHaveBeenCalled()
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })

  test('propagates cancellation when the package manager exits successfully', async () => {
    const controller = new AbortController()
    const options = {packageManager: 'npm' as const, packages: ['next-sanity']}
    controller.abort(new Error('SIGINT'))
    mockExeca.mockResolvedValueOnce({exitCode: 0, failed: false} as Result)

    await expect(
      installNewPackages(options, {...context, cancelSignal: controller.signal}),
    ).rejects.toThrow('SIGINT')

    expect(mockExeca).toHaveBeenCalledWith(
      'npm',
      ['install', '--save', 'next-sanity'],
      expect.objectContaining({cancelSignal: controller.signal}),
    )
    expect(mockSpinner).toHaveBeenCalledWith({
      discardStdin: false,
      text: 'Running npm install --save next-sanity\n',
    })
    expect(mockSpinnerInstance.fail).toHaveBeenCalledOnce()
    expect(mockSpinnerInstance.stop).toHaveBeenCalledOnce()
    expect(mockSpinnerInstance.succeed).not.toHaveBeenCalled()
  })

  test('fails and stops the spinner when the package manager throws', async () => {
    const options = {packageManager: 'npm' as const, packages: ['next-sanity']}
    mockExeca.mockRejectedValueOnce(new Error('Timed out'))

    await expect(installNewPackages(options, context)).rejects.toThrow('Timed out')

    expect(mockSpinnerInstance.fail).toHaveBeenCalledOnce()
    expect(mockSpinnerInstance.stop).toHaveBeenCalledOnce()
    expect(mockSpinnerInstance.succeed).not.toHaveBeenCalled()
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
      reject: false,
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
      reject: false,
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
      reject: false,
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

    await expect(installNewPackages(options, context)).rejects.toMatchObject({
      message: 'Package installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Error: Package not found')
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('handles installation failure with failed flag', async () => {
    const options = {packageManager: 'pnpm' as const, packages: ['failing-package']}
    const mockResult: Partial<Result> = {
      exitCode: 0,
      failed: true,
      stdout: 'Command execution failed',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installNewPackages(options, context)).rejects.toMatchObject({
      message: 'Package installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.log).toHaveBeenCalledWith('Command execution failed')
    expect(mockOutput.error).not.toHaveBeenCalled()
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
      reject: false,
      stdio: 'pipe',
    })
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
  })
})

describe('pnpm ignored build scripts', () => {
  const workDir = '/test/project'
  const context = {output: mockOutput, workDir}

  const approveBuildsNotice =
    'pnpm skipped build scripts for some dependencies. Run "pnpm approve-builds" in the project directory to pick which dependencies should be allowed to run scripts.'

  test('treats ignored esbuild build script as success without notice', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: [
        ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.28.0',
        '',
        'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
      ].join('\n'),
      stdout: 'Packages: +123',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockSpinnerInstance.fail).not.toHaveBeenCalled()
    expect(mockOutput.warn).not.toHaveBeenCalled()
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('treats ignored builds as success but prints notice for non-esbuild packages', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: [
        ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.28.0, sharp@0.34.1.',
        '',
        'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
      ].join('\n'),
      stdout: 'Packages: +123',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockSpinnerInstance.fail).not.toHaveBeenCalled()
    expect(mockOutput.warn).toHaveBeenCalledWith(approveBuildsNotice)
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('prints notice for scoped packages with ignored build scripts', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stdout: ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @tailwindcss/oxide@4.0.0',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockOutput.warn).toHaveBeenCalledWith(approveBuildsNotice)
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('handles line-wrapped error output', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: [
        ' ERR_PNPM_IGNORED_BUILDS  Ignored build',
        'scripts: esbuild@0.28.0,',
        'sharp@0.34.1.',
        '',
        'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
      ].join('\n'),
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockSpinnerInstance.fail).not.toHaveBeenCalled()
    expect(mockOutput.warn).toHaveBeenCalledWith(approveBuildsNotice)
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('does not print notice when wrapped output only skips esbuild', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: [
        ' ERR_PNPM_IGNORED_BUILDS  Ignored build',
        'scripts: esbuild@0.28.0',
        '',
        'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
      ].join('\n'),
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockOutput.warn).not.toHaveBeenCalled()
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('applies to installNewPackages as well', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.28.0',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installNewPackages({packageManager: 'pnpm', packages: ['lodash']}, context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockOutput.warn).not.toHaveBeenCalled()
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('does not apply ignored builds handling for other package managers', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stdout: ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.28.0',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'npm', context)).rejects.toMatchObject({
      message: 'Dependency installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('prints notice for whitespace-separated package list', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stdout: ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.28.0 sharp@0.34.1',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await installDeclaredPackages(workDir, 'pnpm', context)

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.succeed).toHaveBeenCalled()
    expect(mockOutput.warn).toHaveBeenCalledWith(approveBuildsNotice)
    expect(mockOutput.error).not.toHaveBeenCalled()
  })

  test('still fails pnpm installs without the ignored builds marker', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: ' ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/nope: Not Found - 404',
      stdout: 'Packages: +0',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'pnpm', context)).rejects.toMatchObject({
      message: 'Dependency installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockSpinnerInstance.fail).toHaveBeenCalled()
    expect(mockOutput.warn).not.toHaveBeenCalled()
    // The actionable error lives on stderr, so it must be surfaced to the user.
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/nope'),
    )
    expect(mockOutput.error).not.toHaveBeenCalled()
  })
})

describe('versions that are published but not yet installable', () => {
  const workDir = '/test/project'
  const context = {output: mockOutput, workDir}

  test('explains the pnpm failure and how to retry', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: [
        ' ERR_PNPM_NO_MATCHING_VERSION  No matching version found for @typescript-eslint/scope-manager@8.67.0 while fetching it from https://registry.npmjs.org/',
        '',
        'This error happened while installing the dependencies of @sanity/eslint-config-studio@6.0.0',
        ' at typescript-eslint@8.67.0',
        '',
        'The latest release of @typescript-eslint/scope-manager is "8.66.0".',
      ].join('\n'),
      stdout: 'Progress: resolved 526, reused 526, downloaded 0, added 0',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'pnpm', context)).rejects.toMatchObject({
      message: 'Dependency installation failed',
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })

    expect(mockOutput.warn).toHaveBeenCalledWith(
      "@typescript-eslint/scope-manager@8.67.0 isn't available from the npm registry yet. " +
        'New releases are scanned before they become installable, which usually takes a few minutes. ' +
        "Run 'pnpm install' in /test/project again shortly, or check that the version exists on npm.",
    )
  })

  test('strips the trailing period npm puts after the spec', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: 'npm error notarget No matching version found for @sanity/cli-core@2.8.1.',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'npm', context)).rejects.toThrow(
      'Dependency installation failed',
    )

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining("@sanity/cli-core@2.8.1 isn't available from the npm registry yet."),
    )
  })

  test('recognizes the yarn wording', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: 'error Couldn\'t find any versions for "sanity" that matches "^6.9.2"',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'yarn', context)).rejects.toThrow(
      'Dependency installation failed',
    )

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining("sanity@^6.9.2 isn't available from the npm registry yet."),
    )
  })

  test('recognizes the bun wording, which names the range before the package', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: 'error: No version matching "8.67.0" found for specifier "typescript-eslint"',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'bun', context)).rejects.toThrow(
      'Dependency installation failed',
    )

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "typescript-eslint@8.67.0 isn't available from the npm registry yet.",
      ),
    )
  })

  test('handles output wrapped across lines', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: [
        ' ERR_PNPM_NO_MATCHING_VERSION  No matching version found',
        'for @typescript-eslint/utils@8.67.0 while fetching it from',
        'https://registry.npmjs.org/',
      ].join('\n'),
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'pnpm', context)).rejects.toThrow(
      'Dependency installation failed',
    )

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "@typescript-eslint/utils@8.67.0 isn't available from the npm registry yet.",
      ),
    )
  })

  test('points at the command that failed when adding packages', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr:
        ' ERR_PNPM_NO_MATCHING_VERSION  No matching version found for next-sanity@11.0.0 while fetching it from https://registry.npmjs.org/',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(
      installNewPackages({packageManager: 'pnpm', packages: ['next-sanity']}, context),
    ).rejects.toThrow('Package installation failed')

    expect(mockOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining("Run 'pnpm add --save-prod next-sanity' in /test/project again"),
    )
  })

  test('stays quiet for failures that are not a missing version', async () => {
    const mockResult: Partial<Result> = {
      exitCode: 1,
      failed: true,
      stderr: ' ERR_PNPM_FETCH_401  GET https://registry.npmjs.org/private-pkg: Unauthorized',
    }
    mockExeca.mockResolvedValueOnce(mockResult as Result)

    await expect(installDeclaredPackages(workDir, 'pnpm', context)).rejects.toThrow(
      'Dependency installation failed',
    )

    expect(mockOutput.warn).not.toHaveBeenCalled()
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

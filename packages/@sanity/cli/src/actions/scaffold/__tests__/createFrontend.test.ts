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
const mockProgressFail = vi.hoisted(() => vi.fn())
const mockProgressSucceed = vi.hoisted(() => vi.fn())
const mockSpinner = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({execa: mockExeca}))
vi.mock('@sanity/cli-core/ux', () => ({
  spinner: mockSpinner,
}))
vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installNewPackages: mockInstallNewPackages,
}))

const outputLog = vi.fn()
const output = {log: outputLog, warn: vi.fn()} as never

const args = {dirName: 'web', output, packageManager: 'npm' as const, workDir: '/tmp/my-project'}

beforeEach(() => {
  vi.clearAllMocks()
  mockExeca.mockResolvedValue({exitCode: 0})
  mockInstallNewPackages.mockResolvedValue(undefined)
  mockSpinner.mockReturnValue({
    start: () => ({fail: mockProgressFail, succeed: mockProgressSucceed}),
  })
})

describe('createFrontend', () => {
  test('scaffolds without prompting and without a nested git repository', () => {
    return createFrontend(args).then(() => {
      const [command, execArgs, options] = mockExeca.mock.calls[0]
      expect(command).toBe('npx')
      expect(execArgs).toContain('create-next-app@^16')
      expect(execArgs).toContain('web')
      expect(execArgs).toContain('--disable-git')
      expect(execArgs).toContain('--yes')
      expect(options).toMatchObject({cwd: '/tmp/my-project'})
    })
  })

  test('answers npx as well as create-next-app, so nothing in the chain can prompt', async () => {
    await createFrontend(args)

    const [, execArgs, options] = mockExeca.mock.calls[0]
    const spec = (execArgs as string[]).indexOf('create-next-app@^16')
    expect((execArgs as string[]).slice(0, spec)).toContain('--yes')
    expect((execArgs as string[]).slice(spec)).toContain('--yes')
    expect(options).toMatchObject({env: expect.objectContaining({npm_config_yes: 'true'})})
  })

  test('constrains the scaffolder to a major, never @latest', async () => {
    await createFrontend(args)

    const execArgs = mockExeca.mock.calls[0][1] as string[]
    const spec = execArgs.find((arg) => arg.startsWith('create-next-app'))
    expect(spec).toMatch(/^create-next-app@\^\d+$/)
    expect(spec).not.toContain('latest')
  })

  test('prints the same command it runs, package-manager flag aside', async () => {
    await createFrontend(args)

    const execArgs = mockExeca.mock.calls[0][1] as string[]
    expect(`npx ${execArgs.filter((arg) => !arg.startsWith('--use-')).join(' ')}`).toBe(
      frontendScaffoldCommand('web'),
    )
  })

  test('tells create-next-app which package manager to use', async () => {
    await createFrontend({...args, packageManager: 'pnpm'})

    expect(mockExeca.mock.calls[0][1]).toContain('--use-pnpm')
  })

  test('omits the package-manager flag when there is no equivalent', async () => {
    await createFrontend({...args, packageManager: 'manual'})

    const execArgs = mockExeca.mock.calls[0][1] as string[]
    expect(execArgs.some((arg) => arg.startsWith('--use-'))).toBe(false)
  })

  test('does not install dependencies: that is a separate, separately-failing step', async () => {
    await createFrontend(args)

    expect(mockInstallNewPackages).not.toHaveBeenCalled()
  })

  test('closes stdin, so a prompt we missed fails instead of hanging', async () => {
    await createFrontend(args)

    const options = mockExeca.mock.calls[0][2]
    expect(options).toMatchObject({stdio: ['ignore', 'pipe', 'pipe']})
    expect(mockSpinner).toHaveBeenCalledWith({
      discardStdin: true,
      text: 'Creating your Next.js app\n',
    })
  })

  test('keeps terminal SIGINT enabled while cancellation is active', async () => {
    const controller = new AbortController()

    await createFrontend({...args, cancelSignal: controller.signal})

    expect(mockSpinner).toHaveBeenCalledWith({
      discardStdin: false,
      text: 'Creating your Next.js app\n',
    })
  })

  test('wraps a scaffolder failure so the caller can keep the minted project', async () => {
    mockExeca.mockRejectedValue(new Error('ENOENT'))

    await expect(createFrontend(args)).rejects.toThrow(FrontendScaffoldError)
    await expect(createFrontend(args)).rejects.toThrow('create-next-app failed: ENOENT')
    expect(mockInstallNewPackages).not.toHaveBeenCalled()
  })

  test('surfaces the scaffolder output on a non-zero exit, which stdout alone would hide', async () => {
    mockExeca.mockResolvedValue({exitCode: 1, stderr: 'EACCES: permission denied', stdout: ''})

    await expect(createFrontend(args)).rejects.toThrow('create-next-app failed with exit code 1')
    expect(outputLog).toHaveBeenCalledWith('EACCES: permission denied')
  })

  test('reports a failure that produced no output at all', async () => {
    mockExeca.mockResolvedValue({exitCode: 1, stderr: '', stdout: ''})

    await expect(createFrontend(args)).rejects.toThrow('create-next-app failed with exit code 1')
    expect(outputLog).not.toHaveBeenCalled()
  })

  test('survives a thrown value that is not an Error', async () => {
    mockExeca.mockRejectedValue('killed')

    await expect(createFrontend(args)).rejects.toThrow('create-next-app failed: killed')
  })

  test('treats a spawn failure with no exit code as a failure too', async () => {
    mockExeca.mockResolvedValue({failed: true, stderr: 'spawn npx ENOENT'})

    await expect(createFrontend(args)).rejects.toThrow(FrontendScaffoldError)
  })

  test('propagates cancellation when create-next-app exits successfully on SIGINT', async () => {
    const controller = new AbortController()
    mockExeca.mockImplementation(async () => {
      controller.abort(new Error('SIGINT'))
      return {exitCode: 0}
    })

    const error = await createFrontend({...args, cancelSignal: controller.signal}).catch(
      (err: unknown) => err,
    )

    expect(error).toEqual(new Error('SIGINT'))
    expect(error).not.toBeInstanceOf(FrontendScaffoldError)
    expect(mockExeca.mock.calls[0][2]).toMatchObject({cancelSignal: controller.signal})
    expect(mockProgressFail).toHaveBeenCalledOnce()
    expect(mockProgressSucceed).not.toHaveBeenCalled()
  })
})

describe('installFrontendDeps', () => {
  test('installs next-sanity into the frontend, not the parent directory', async () => {
    await installFrontendDeps(args)

    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      {packageManager: 'npm', packages: ['next-sanity@13']},
      expect.objectContaining({workDir: path.join('/tmp/my-project', 'web')}),
    )
  })

  test('normalises the CLIError that installNewPackages throws into our own type', async () => {
    mockInstallNewPackages.mockRejectedValue(new Error('registry down'))

    await expect(installFrontendDeps(args)).rejects.toThrow(FrontendScaffoldError)
    await expect(installFrontendDeps(args)).rejects.toThrow(
      'Installing next-sanity failed: registry down',
    )
  })

  test('normalises a thrown value that is not an Error', async () => {
    mockInstallNewPackages.mockRejectedValue('ENOSPC')

    await expect(installFrontendDeps(args)).rejects.toThrow('Installing next-sanity failed: ENOSPC')
  })

  test('propagates cancellation while installing next-sanity', async () => {
    const controller = new AbortController()
    mockInstallNewPackages.mockImplementation(async () => {
      controller.abort(new Error('SIGINT'))
      controller.signal.throwIfAborted()
    })

    const error = await installFrontendDeps({...args, cancelSignal: controller.signal}).catch(
      (err: unknown) => err,
    )

    expect(error).toEqual(new Error('SIGINT'))
    expect(error).not.toBeInstanceOf(FrontendScaffoldError)
    expect(mockInstallNewPackages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({cancelSignal: controller.signal}),
    )
  })
})

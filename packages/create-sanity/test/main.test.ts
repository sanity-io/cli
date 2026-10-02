import {EventEmitter} from 'node:events'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
const initStudioMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: spawnMock,
}))
vi.mock('../src/init.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/init.js')>()),
  initStudio: initStudioMock,
}))

vi.stubGlobal('__SANITY_CLI_VERSION__', '9.9.9')
const {main, supportsEnvProxy} = await import('../src/index.js')
const {InitError} = await import('../src/ui.js')

function fakeChild(code: number) {
  const child = new EventEmitter()
  queueMicrotask(() => child.emit('close', code))
  return child
}

let cwd: string
let stdout: string
let stderr: string
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'create-sanity-main-'))
  vi.spyOn(process, 'cwd').mockReturnValue(cwd)
  stdout = ''
  stderr = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += chunk
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += chunk
    return true
  })
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    vi.stubEnv(key, '')
  }
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await rm(cwd, {force: true, recursive: true})
})

describe('main', () => {
  test('prints help', async () => {
    expect(await main(['--help'])).toBe(0)
    expect(stdout).toMatch(/create sanity/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('delegates unsupported flags to the pinned sanity CLI', async () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/10.7.1 npm/? node/v22.14.0 linux x64')
    spawnMock.mockReturnValue(fakeChild(3))
    expect(await main(['--bare', '--project', 'p1'])).toBe(3)
    expect(spawnMock).toHaveBeenCalledWith(
      'pnpm',
      ['dlx', '@sanity/cli@9.9.9', 'init', '--bare', '--project', 'p1', '--from-create'],
      expect.objectContaining({stdio: 'inherit'}),
    )
  })

  test('reports usage errors without the full CLI, ignoring separators', async () => {
    expect(await main(['--', '--projct', 'p1'])).toBe(2)
    expect(stderr).toMatch(/Error: Nonexistent flag: --projct/)
    expect(spawnMock).not.toHaveBeenCalled()

    vi.stubEnv('NODE_USE_ENV_PROXY', '1')
    initStudioMock.mockResolvedValueOnce(undefined)
    expect(await main(['--', '--project', 'p1'])).toBe(0)
    expect(initStudioMock.mock.calls[0][0]).toMatchObject({project: 'p1'})
  })

  test('delegates inside Next.js projects', async () => {
    await writeFile(join(cwd, 'package.json'), JSON.stringify({dependencies: {next: '16'}}))
    spawnMock.mockReturnValue(fakeChild(0))
    expect(await main(['-y'])).toBe(0)
    expect(spawnMock.mock.calls[0][1]).toContain('init')
    expect(initStudioMock).not.toHaveBeenCalled()
  })

  test('re-runs itself with proxy support when a proxy is configured', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example:8080')
    vi.stubEnv('NODE_USE_ENV_PROXY', '')
    spawnMock.mockReturnValue(fakeChild(0))
    expect(await main(['-y'])).toBe(0)
    const [command, args, options] = spawnMock.mock.calls[0]
    expect(command).toBe(process.execPath)
    expect(args[0]).toBe('--disable-warning=UNDICI-EHPA')
    expect(options.env.NODE_USE_ENV_PROXY).toBe('1')
  })

  test('runs the built-in initializer and reports errors', async () => {
    vi.stubEnv('NODE_USE_ENV_PROXY', '1')
    initStudioMock.mockResolvedValueOnce(undefined)
    expect(await main(['-y', '--project', 'p1', '--output-path', '.'])).toBe(0)
    expect(initStudioMock).toHaveBeenCalledWith(
      expect.objectContaining({outputPath: '.', project: 'p1', unattended: true}),
      expect.objectContaining({cliVersion: '9.9.9', workDir: cwd}),
    )

    initStudioMock.mockRejectedValueOnce(new InitError('Line one\nLine two', 2))
    expect(await main(['-y'])).toBe(2)
    expect(stderr).toMatch(/Error: Line one\n.*Line two/)

    initStudioMock.mockRejectedValueOnce(new Error('Unexpected'))
    expect(await main(['-y'])).toBe(1)

    const abort = new Error('User force closed the prompt')
    abort.name = 'ExitPromptError'
    initStudioMock.mockRejectedValueOnce(abort)
    expect(await main([])).toBe(130)
    expect(stderr).toMatch(/Aborted by user/)
  })
})

describe('supportsEnvProxy', () => {
  test.each([
    ['22.12.0', false],
    ['22.20.9', false],
    ['22.21.0', true],
    ['23.11.0', false],
    ['24.0.0', true],
    ['25.1.0', true],
  ])('%s', (version, supported) => {
    expect(supportsEnvProxy(version)).toBe(supported)
  })
})

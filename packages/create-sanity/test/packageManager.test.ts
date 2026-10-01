import {EventEmitter} from 'node:events'
import {chmod, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PassThrough} from 'node:stream'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
const selectMock = vi.hoisted(() => vi.fn())
const warnings = vi.hoisted(() => [] as string[])

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: spawnMock,
}))
vi.mock('../src/ui.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui.js')>()),
  output: {log: vi.fn(), warn: (line: string) => warnings.push(line)},
  select: selectMock,
  spinner: () => {
    const spin = {fail: () => spin, start: () => spin, stop: () => spin, succeed: () => spin}
    return spin
  },
}))

const {installDependencies, resolvePackageManager} = await import('../src/packageManager.js')
const {runProjectCli, tryGitInit, writeStagingEnvIfNeeded} = await import('../src/post.js')

function fakeChild(code: number, text = '') {
  const child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    stdout: new PassThrough(),
  })
  queueMicrotask(() => {
    child.stdout.end(text)
    child.stderr.end()
    child.emit('close', code)
  })
  return child
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'create-sanity-pm-'))
  warnings.length = 0
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await rm(dir, {force: true, recursive: true})
})

async function fakeBin(name: string) {
  const bin = join(dir, 'node_modules', '.bin')
  await mkdir(bin, {recursive: true})
  await writeFile(join(bin, name), '#!/bin/sh\n')
  await chmod(join(bin, name), 0o755)
}

describe('resolvePackageManager', () => {
  test('an explicit choice wins', async () => {
    expect(
      await resolvePackageManager({interactive: true, packageManager: 'yarn', targetDir: dir}),
    ).toBe('yarn')
  })

  test('uses the lockfile package manager when installed', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({packageManager: 'fakepm@1.0.0'}))
    await writeFile(join(dir, 'yarn.lock'), '')
    await fakeBin('yarn')
    expect(
      await resolvePackageManager({interactive: true, packageManager: undefined, targetDir: dir}),
    ).toBe('yarn')
  })

  test('falls back to the running package manager when unattended', async () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.9.0 node/v22 linux x64')
    expect(
      await resolvePackageManager({interactive: false, packageManager: undefined, targetDir: dir}),
    ).toBe('npm')
  })

  test('asks which installed package manager to use', async () => {
    await writeFile(join(dir, 'bun.lock'), '')
    selectMock.mockImplementationOnce(async ({choices, message}) => {
      expect(message).toMatch(/preferred is bun, but is not installed|Package manager/)
      expect(choices.at(-1)).toEqual({name: 'manual', value: 'manual'})
      return 'manual'
    })
    vi.stubEnv('PATH', '')
    const resolved = await resolvePackageManager({
      interactive: true,
      packageManager: undefined,
      targetDir: dir,
    })
    expect(['bun', 'manual']).toContain(resolved)
  })
})

describe('installDependencies', () => {
  test('runs the install', async () => {
    spawnMock.mockReturnValueOnce(fakeChild(0))
    await installDependencies(dir, 'npm')
    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['install'],
      expect.objectContaining({cwd: dir, env: expect.objectContaining({PATH: expect.any(String)})}),
    )
  })

  test('manual installs do nothing', async () => {
    await installDependencies(dir, 'manual')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('treats skipped pnpm build scripts as success', async () => {
    spawnMock.mockReturnValueOnce(
      fakeChild(1, 'ERR_PNPM_IGNORED_BUILDS Ignored build scripts: esbuild@0.25.0.'),
    )
    await installDependencies(dir, 'pnpm')
    expect(warnings).toEqual([])
    spawnMock.mockReturnValueOnce(
      fakeChild(1, 'ERR_PNPM_IGNORED_BUILDS Ignored build scripts: sharp@0.34.0.'),
    )
    await installDependencies(dir, 'pnpm')
    expect(warnings[0]).toMatch(/pnpm approve-builds/)
  })

  test('fails on install errors', async () => {
    spawnMock.mockReturnValueOnce(fakeChild(1, 'ERESOLVE'))
    await expect(installDependencies(dir, 'npm')).rejects.toThrow('Dependency installation failed')
    const child = new EventEmitter()
    spawnMock.mockReturnValueOnce(
      Object.assign(child, {stderr: new PassThrough(), stdout: new PassThrough()}),
    )
    const pending = installDependencies(dir, 'yarn')
    child.emit('error', new Error('spawn yarn ENOENT'))
    await expect(pending).rejects.toThrow('spawn yarn ENOENT')
  })
})

describe('post steps', () => {
  test('runs the installed project CLI', async () => {
    await fakeBin('sanity')
    spawnMock.mockReturnValueOnce(fakeChild(0))
    expect(
      await runProjectCli(dir, ['mcp', 'configure'], {cliVersion: '1.0.0', interactive: true}),
    ).toBe(0)
    expect(spawnMock).toHaveBeenCalledWith(
      join(dir, 'node_modules', '.bin', 'sanity'),
      ['mcp', 'configure'],
      expect.objectContaining({cwd: dir, stdio: ['inherit', 'inherit', 'inherit']}),
    )
    const child = new EventEmitter()
    spawnMock.mockReturnValueOnce(child)
    const pending = runProjectCli(dir, ['x'], {cliVersion: '1.0.0', interactive: false})
    child.emit('error', new Error('nope'))
    expect(await pending).toBe(1)
    expect(warnings[0]).toMatch(/Could not run `sanity x`: nope/)
  })

  test('records non-production environments in .env', async () => {
    await writeStagingEnvIfNeeded(dir)
    await expect(readFile(join(dir, '.env'), 'utf8')).rejects.toThrow()
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    await writeFile(join(dir, '.env'), 'OTHER=1')
    await writeStagingEnvIfNeeded(dir)
    expect(await readFile(join(dir, '.env'), 'utf8')).toBe('OTHER=1\nSANITY_INTERNAL_ENV=staging\n')
    await writeStagingEnvIfNeeded(dir)
    expect(await readFile(join(dir, '.env'), 'utf8')).toBe('OTHER=1\nSANITY_INTERNAL_ENV=staging\n')
  })

  test('initializes git with an initial commit', async () => {
    const repo = join(dir, 'repo')
    await mkdir(repo)
    await writeFile(join(repo, 'file.txt'), 'hello')
    vi.stubEnv('GIT_AUTHOR_NAME', 'Test')
    vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com')
    vi.stubEnv('GIT_COMMITTER_NAME', 'Test')
    vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com')
    vi.stubEnv('GIT_CONFIG_GLOBAL', join(dir, 'gitconfig'))
    expect(tryGitInit(repo, 'first')).toBe(true)
    // Already inside a repository
    expect(tryGitInit(repo)).toBe(false)
  })
})

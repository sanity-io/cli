import {createHash} from 'node:crypto'
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ensureToolchain, loadToolchainModule} from '../toolchain.js'

const {cpu, home, install, libc, spin, system} = vi.hoisted(() => ({
  cpu: vi.fn(() => 'arm64'),
  home: vi.fn(),
  install: vi.fn(),
  libc: vi.fn(() => 'glibc'),
  spin: {fail: vi.fn(), start: vi.fn(), succeed: vi.fn()},
  system: vi.fn(() => 'darwin'),
}))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: cpu,
  homedir: home,
  platform: system,
}))
vi.mock('detect-libc', () => ({familySync: libc}))
vi.mock('execa', () => ({execa: install}))
vi.mock('@sanity/cli-core/ux', () => ({
  spinner: () => ({
    start: () => {
      spin.start()
      return spin
    },
  }),
}))

describe('local native toolchain cache', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cli-toolchain-test-'))
    vi.stubEnv('XDG_CACHE_HOME', root)
    vi.clearAllMocks()
    system.mockReturnValue('darwin')
    cpu.mockReturnValue('arm64')
    home.mockReturnValue(root)
    libc.mockReturnValue('glibc')
    install.mockResolvedValue({})
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(root, {force: true, recursive: true})
  })

  test('installs exact versions once for concurrent requests and publishes a ready cache', async () => {
    const [first, second] = await Promise.all([
      ensureToolchain({rolldown: '1.2.6', vite: '8.3.0'}),
      ensureToolchain({rolldown: '1.2.6', vite: '8.3.0'}),
    ])
    expect(first).toBe(second)
    expect(install).toHaveBeenCalledOnce()
    const [command, args, options] = install.mock.calls[0]
    expect(command).toBe('npm')
    expect(args).toEqual([
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
    ])
    expect(options.env.npm_config_cache).toBe(join(options.cwd, '.npm'))
    expect(JSON.parse(await readFile(join(first, 'package.json'), 'utf8'))).toEqual({
      dependencies: {rolldown: '1.2.6', vite: '8.3.0'},
      private: true,
    })
    expect(await readFile(join(first, '.ready'), 'utf8')).toHaveLength(16)
    await expect(ensureToolchain({rolldown: '1.2.6', vite: '8.3.0'})).resolves.toBe(first)
    expect(install).toHaveBeenCalledOnce()
    expect(spin.succeed).toHaveBeenCalledOnce()
    expect(await readdir(join(root, 'sanity/cli-toolchains'))).toEqual([basename(first)])
  })

  test('reuses a completed cache across module loads', async () => {
    const deps = {vite: '8.3.0'}
    const cache = await ensureToolchain(deps)
    vi.resetModules()
    const fresh = await import('../toolchain.js')
    await expect(fresh.ensureToolchain(deps)).resolves.toBe(cache)
    expect(install).toHaveBeenCalledOnce()
  })

  test('separates dependency versions', async () => {
    const first = await ensureToolchain({vite: '8.2.0'})
    const second = await ensureToolchain({vite: '8.3.0'})
    expect(second).not.toBe(first)
    expect(install).toHaveBeenCalledTimes(2)
  })

  test('defaults to the home cache when XDG_CACHE_HOME is unset', async () => {
    vi.stubEnv('XDG_CACHE_HOME', '')
    await expect(ensureToolchain({vite: '8.3.0'})).resolves.toContain(
      join(root, '.cache/sanity/cli-toolchains'),
    )
  })

  test('rejects a concurrent installation without a matching ready marker', async () => {
    const hash = createHash('sha256').update('{"vite":"8.3.0"}').digest('hex').slice(0, 16)
    install.mockImplementation(async (_command, _args, {cwd}) => {
      const cache = join(cwd, '..', `darwin-arm64-native-${hash}`)
      await mkdir(cache)
      await writeFile(join(cache, '.ready'), 'wrong version')
    })
    await expect(ensureToolchain({vite: '8.3.0'})).rejects.toThrow("Couldn't install command tools")
    expect(spin.fail).toHaveBeenCalledOnce()
    expect(await readdir(join(root, 'sanity/cli-toolchains'))).toHaveLength(1)
  })

  test('reports non-Error installation failures and removes the staging directory', async () => {
    install.mockRejectedValue('Registry unavailable')
    await expect(ensureToolchain({vite: '8.3.0'})).rejects.toThrow(
      "Couldn't install command tools: Registry unavailable",
    )
    expect(await readdir(join(root, 'sanity/cli-toolchains'))).toEqual([])
  })

  test('cleans failed installs and permits retry', async () => {
    install.mockRejectedValueOnce(new Error('Registry unavailable'))
    await expect(ensureToolchain({vite: '8.3.0'})).rejects.toThrow(
      "Couldn't install command tools: Registry unavailable",
    )
    expect(spin.fail).toHaveBeenCalledOnce()
    expect(await readdir(join(root, 'sanity/cli-toolchains'))).toEqual([])
    await expect(ensureToolchain({vite: '8.3.0'})).resolves.toContain(root)
    expect(install).toHaveBeenCalledTimes(2)
  })

  test('accepts a ready cache installed by a concurrent process', async () => {
    const hash = createHash('sha256').update('{"vite":"8.3.0"}').digest('hex').slice(0, 16)
    install.mockImplementation(async (_command, _args, {cwd}) => {
      const parent = join(cwd, '..')
      const cache = join(parent, `darwin-arm64-native-${hash}`)
      await mkdir(cache)
      await writeFile(join(cache, '.ready'), hash)
    })
    await expect(ensureToolchain({vite: '8.3.0'})).resolves.toContain(hash)
    expect(spin.succeed).toHaveBeenCalledOnce()
    expect(await readdir(join(root, 'sanity/cli-toolchains'))).toHaveLength(1)
  })

  test('identifies an incomplete cache without attempting another install', async () => {
    const hash = createHash('sha256').update('{"vite":"8.3.0"}').digest('hex').slice(0, 16)
    const cache = join(root, 'sanity/cli-toolchains', `darwin-arm64-native-${hash}`)
    await mkdir(cache, {recursive: true})
    await writeFile(join(cache, '.ready'), 'incomplete')
    await expect(ensureToolchain({vite: '8.3.0'})).rejects.toThrow(
      `Command tools cache is incomplete: ${cache}`,
    )
    expect(install).not.toHaveBeenCalled()
  })

  test('separates architectures and Linux libc implementations', async () => {
    system.mockReturnValue('linux')
    const glibc = await ensureToolchain({vite: '8.3.0'})
    libc.mockReturnValue('musl')
    const musl = await ensureToolchain({vite: '8.3.0'})
    cpu.mockReturnValue('x64')
    const x64 = await ensureToolchain({vite: '8.3.0'})
    expect(glibc).toContain('linux-arm64-glibc-')
    expect(musl).toContain('linux-arm64-musl-')
    expect(x64).toContain('linux-x64-musl-')
    expect(install).toHaveBeenCalledTimes(3)
  })

  test('resolves the implementation from the cache, outside the CLI dependency tree', async () => {
    install.mockImplementation(async (_command, _args, {cwd}) => {
      const pkg = join(cwd, 'node_modules/test-build-tool')
      await mkdir(pkg, {recursive: true})
      await writeFile(
        join(pkg, 'package.json'),
        JSON.stringify({exports: './index.js', type: 'module'}),
      )
      await writeFile(join(pkg, 'index.js'), 'export const answer = 42')
    })
    expect(
      await loadToolchainModule('test-build-tool', {'test-build-tool': '1.0.0'}),
    ).toMatchObject({answer: 42})
  })
})

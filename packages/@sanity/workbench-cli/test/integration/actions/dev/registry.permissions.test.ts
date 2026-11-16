import {chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  acquireWorkbenchLock,
  getRegisteredServers,
  readWorkbenchLock,
  registerDevServer,
} from '../../../../src/actions/dev/registry.js'

let dataDir: string

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getSanityDataDir: () => dataDir,
}))

const mode = (path: string) => statSync(path).mode & 0o777

describe.skipIf(process.platform === 'win32')('registry permissions', () => {
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sanity-registry-permissions-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dataDir, {force: true, recursive: true})
  })

  test('creates private registry entries and preserves their permissions on update', () => {
    const registration = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'studio',
      workDir: dataDir,
    })
    const lock = acquireWorkbenchLock({host: 'localhost', organizationId: 'org', port: 3333})!
    const dir = join(dataDir, 'dev-servers')
    const manifest = join(dir, `${process.pid}.json`)
    const lockFile = join(dir, 'workbench-org.lock')

    registration.update({port: 3334})
    lock.updatePort(3334)

    expect(mode(dir)).toBe(0o700)
    expect(mode(manifest)).toBe(0o600)
    expect(mode(lockFile)).toBe(0o600)
    registration.release()
    lock.release()
  })

  test('restricts existing files and directory when read', () => {
    const registration = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'studio',
      workDir: dataDir,
    })
    const lock = acquireWorkbenchLock({host: 'localhost', organizationId: 'org', port: 3333})!
    const dir = join(dataDir, 'dev-servers')
    const manifest = join(dir, `${process.pid}.json`)
    const lockFile = join(dir, 'workbench-org.lock')
    chmodSync(dir, 0o755)
    chmodSync(manifest, 0o644)
    chmodSync(lockFile, 0o644)

    expect(getRegisteredServers()).toHaveLength(1)
    expect(readWorkbenchLock('org')).toBeDefined()
    expect(mode(dir)).toBe(0o700)
    expect(mode(manifest)).toBe(0o600)
    expect(mode(lockFile)).toBe(0o600)
    registration.release()
    lock.release()
  })

  test('restricts an existing manifest before overwriting it', () => {
    const dir = join(dataDir, 'dev-servers')
    mkdirSync(dir)
    const manifest = join(dir, `${process.pid}.json`)
    writeFileSync(manifest, '{}')
    chmodSync(manifest, 0o644)

    const registration = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'studio',
      workDir: dataDir,
    })

    expect(mode(manifest)).toBe(0o600)
    registration.release()
  })

  test('does not change permissions of a directory owned by another user', () => {
    const dir = join(dataDir, 'dev-servers')
    mkdirSync(dir)
    chmodSync(dir, 0o755)
    vi.spyOn(process, 'getuid').mockReturnValue(process.getuid!() + 1)

    expect(getRegisteredServers()).toEqual([])
    expect(mode(dir)).toBe(0o755)
  })

  test('does not change permissions of a file owned by another user', () => {
    const registration = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'studio',
      workDir: dataDir,
    })
    const manifest = join(dataDir, 'dev-servers', `${process.pid}.json`)
    chmodSync(manifest, 0o644)
    vi.spyOn(process, 'getuid').mockReturnValue(process.getuid!() + 1)

    expect(getRegisteredServers()).toHaveLength(1)
    expect(mode(manifest)).toBe(0o644)
    registration.release()
  })

  test('preserves existing owner permissions when restricting a file', () => {
    const registration = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'studio',
      workDir: dataDir,
    })
    const manifest = join(dataDir, 'dev-servers', `${process.pid}.json`)
    chmodSync(manifest, 0o444)

    expect(getRegisteredServers()).toHaveLength(1)
    expect(mode(manifest)).toBe(0o400)
    registration.release()
  })
})

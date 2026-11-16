import {mkdtempSync, rmSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  acquireWorkbenchLock,
  registerDevServer,
  watchRegistry,
} from '../../../../src/actions/dev/registry.js'

let dataDir: string
let previousUmask: number

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getSanityDataDir: () => dataDir,
}))

const mode = (path: string) => statSync(path).mode & 0o777

describe.skipIf(process.platform === 'win32')('registry permissions', () => {
  beforeEach(() => {
    previousUmask = process.umask(0o022)
    dataDir = mkdtempSync(join(tmpdir(), 'sanity-registry-permissions-'))
  })

  afterEach(() => {
    process.umask(previousUmask)
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

  test('creates a private registry directory when watching first', () => {
    const watcher = watchRegistry(() => {})

    expect(mode(join(dataDir, 'dev-servers'))).toBe(0o700)
    watcher.close()
  })
})

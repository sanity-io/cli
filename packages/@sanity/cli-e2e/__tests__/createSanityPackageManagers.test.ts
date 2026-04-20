import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getAvailablePackageManagers} from '../helpers/packageManagers.js'

const isRegistryMode = process.env.E2E_REGISTRY_MODE === 'true'
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)

// TODO: yarn v1 + Node <22 fails because preferred-pm@5 requires node >=22.13
// and yarn v1 enforces engine checks. Remove this skip when Node 20 is dropped.
const skipYarnOnOldNode = (name: string) => name === 'yarn' && nodeMajor < 22

describe.skipIf(!isRegistryMode)('create-sanity via package managers', {timeout: 60_000}, () => {
  const version = 'latest'
  const managers = getAvailablePackageManagers()

  let tempDir: string
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sanity-e2e-'))
  })
  afterEach(() => {
    rmSync(tempDir, {force: true, recursive: true})
  })

  for (const pm of managers) {
    describe(pm.name, () => {
      test.skipIf(skipYarnOnOldNode(pm.name))(
        `${pm.name} create sanity@${version} --help exits 0`,
        () => {
          const [cmd, ...args] = pm.createCommand(version, ['--help'])
          let result: string
          try {
            result = execFileSync(cmd, args, {
              cwd: tempDir,
              encoding: 'utf8',
              env: {
                ...process.env,
                NO_UPDATE_NOTIFIER: '1',
                NODE_ENV: 'production',
                NODE_NO_WARNINGS: '1',
              },
              stdio: 'pipe',
              timeout: 60_000,
            })
          } catch (err) {
            const stderr = (err as {stderr?: Buffer | string}).stderr
            throw new Error(`${cmd} failed:\n${String(stderr || err)}`, {cause: err})
          }

          expect(result).toContain('Initialize a new Sanity Studio')
        },
      )
    })
  }
})

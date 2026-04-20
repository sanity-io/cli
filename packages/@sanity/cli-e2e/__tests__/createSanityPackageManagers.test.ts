import {execFileSync} from 'node:child_process'

import {describe, expect, test} from 'vitest'

import {getAvailablePackageManagers} from '../helpers/packageManagers.js'

const isRegistryMode = !!process.env.E2E_BINARY_PATH

describe.skipIf(!isRegistryMode)('create-sanity via package managers', () => {
  const version = 'latest'
  const managers = getAvailablePackageManagers()

  for (const pm of managers) {
    describe(pm.name, () => {
      test(`${pm.name} create sanity@${version} --help exits 0`, () => {
        const [cmd, ...args] = pm.createCommand(version, ['--help'])

        let result: string
        try {
          result = execFileSync(cmd, args, {
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
      })
    })
  }
})

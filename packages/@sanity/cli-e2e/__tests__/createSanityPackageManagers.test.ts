import {execFileSync} from 'node:child_process'

import {describe, expect, test} from 'vitest'

import {getAvailablePackageManagers} from '../helpers/packageManagers.js'

// Only run against a known-published version (set by post-release CI).
// The local workspace version may not exist on npm, and package managers
// fetch from the registry, so falling back to it would cause false failures.
const version = process.env.E2E_PACKAGE_VERSION

describe.skipIf(!version)('create-sanity via package managers', () => {
  const managers = getAvailablePackageManagers()

  for (const pm of managers) {
    describe(pm.name, () => {
      test(`${pm.name} create sanity@${version} --help exits 0`, () => {
        const [cmd, ...args] = pm.createCommand(version!, ['--help'])

        const result = execFileSync(cmd, args, {
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

        expect(result).toContain('sanity init')
      })
    })
  }
})

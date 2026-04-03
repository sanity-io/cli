import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'

import {describe, expect, test} from 'vitest'

import {getAvailablePackageManagers} from '../helpers/packageManagers.js'

const require = createRequire(import.meta.url)

function getVersion(): string | undefined {
  if (process.env.E2E_PACKAGE_VERSION) return process.env.E2E_PACKAGE_VERSION

  try {
    const pkg = require('create-sanity/package.json')
    return pkg.version
  } catch {
    return undefined
  }
}

const version = getVersion()

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

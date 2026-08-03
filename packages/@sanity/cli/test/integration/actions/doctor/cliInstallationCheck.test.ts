import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {cliInstallationCheck} from '../../../../src/actions/doctor/checks/cliInstallation.js'

// Prevent real global CLI installations on the developer's machine from
// leaking into tests and producing environment-dependent warnings
vi.mock('../../../../src/util/packageManager/installationInfo/detectGlobals.js', () => ({
  detectGlobalInstallations: vi.fn().mockResolvedValue([]),
}))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(
  __dirname,
  '..',
  '..',
  'util',
  'packageManager',
  'installationInfo',
  '__fixtures__',
)

describe('cliInstallationCheck', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns error status when sanity is declared but not installed', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')

    const result = await cliInstallationCheck.run({cwd})

    // standalone-npm declares sanity@^3.67.0 but has no node_modules.
    // With workspace-root bounded search, sanity won't be found as installed,
    // so we expect a declared-not-installed error.
    expect(result.status).toBe('error')
    const errorMsg = result.messages.find((m) => m.type === 'error')
    if (!errorMsg) throw new Error('Expected an error message')
    expect(errorMsg.text).toBeDefined()
    expect(errorMsg.suggestions).toBeDefined()
  })

  test('shows issue messages with suggestions when problems exist', async () => {
    const cwd = path.join(fixturesDir, 'multiple-lockfiles')

    const result = await cliInstallationCheck.run({cwd})

    // Should have at least one warning/error message
    const issueMessages = result.messages.filter((m) => m.type === 'warning' || m.type === 'error')
    expect(issueMessages.length).toBeGreaterThan(0)

    // Each warning/error issue should have a suggestion
    for (const msg of issueMessages) {
      expect(msg.suggestions?.length).toBeGreaterThan(0)
    }
  })
})

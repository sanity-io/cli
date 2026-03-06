import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {cliInstallationCheck} from '../checks/cliInstallation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'util',
  'packageManager',
  'installationInfo',
  '__tests__',
  '__fixtures__',
)

describe('cliInstallationCheck', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('shows success message with version when no issues found', async () => {
    const cwd = path.join(fixturesDir, 'clean-npm-install')

    const result = await cliInstallationCheck.run({cwd})

    expect(result.status).toBe('passed')
    // Should have a brief success message, not verbose info dump
    const successMsg = result.messages.find((m) => m.type === 'success')
    expect(successMsg).toBeDefined()
    expect(successMsg?.text).toContain('sanity@')
    expect(successMsg?.text).toContain('no issues found')

    // Should NOT have info-dump messages about workspace type, execution context
    const infoMessages = result.messages.filter((m) => m.type === 'info')
    expect(infoMessages.filter((m) => m.text.startsWith('Workspace:'))).toHaveLength(0)
    expect(infoMessages.filter((m) => m.text.startsWith('Running CLI from:'))).toHaveLength(0)
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

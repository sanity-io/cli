import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {workbenchApp} from '../../actions/dev/__tests__/testHelpers.js'

import {createMockSanityCommand} from '../../../test/mockSanityCommand.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()

// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    SanityCommand: MockedSanityCommand,
  }
})

vi.mock(import('../../actions/dev/devAction.js'), () => ({
  devAction: vi.fn(),
}))

// Finally, import the module under test: dev command
const {DevCommand, shouldWarnDashboardFlagIgnored} = await import('../dev.js')

describe('#dev', () => {
  test('shows an error for invalid flags', async () => {
    await expect(DevCommand.run(['--invalid'])).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Nonexistent flag: --invalid'),
      }),
    )
  })
})

describe('shouldWarnDashboardFlagIgnored', () => {
  const workbenchConfig = {app: workbenchApp()} as CliConfig

  test('warns for a workbench app whenever --load-in-dashboard is passed', () => {
    expect(shouldWarnDashboardFlagIgnored(workbenchConfig, true)).toBe(true)
    expect(shouldWarnDashboardFlagIgnored(workbenchConfig, false)).toBe(true)
  })

  test('does not warn when the flag is omitted', () => {
    expect(shouldWarnDashboardFlagIgnored(workbenchConfig, undefined)).toBe(false)
  })

  test('does not warn for non-workbench projects', () => {
    expect(shouldWarnDashboardFlagIgnored(undefined, true)).toBe(false)
    expect(shouldWarnDashboardFlagIgnored({} as CliConfig, true)).toBe(false)
  })
})

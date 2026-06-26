import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {workbenchApp} from '../../actions/dev/__tests__/testHelpers.js'
import {shouldWarnDashboardFlagIgnored} from '../dev.js'

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

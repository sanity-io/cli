import {styleText} from 'node:util'

import {describe, expect, test} from 'vitest'

import {formatDashboardSummary} from '../dashboardSummary.js'

describe('formatDashboardSummary', () => {
  const url = 'http://localhost:3333/applications/test-app'
  const link = styleText(['blue', 'underline'], url)

  test('lists organization, app, URL and deployed version under the ready line', () => {
    const summary = formatDashboardSummary({
      action: 'ready',
      durationMs: 1234,
      isApp: true,
      organizationName: 'Acme',
      title: 'Reports',
      url,
      version: 'local preview',
    })

    expect(summary).toBe(
      [
        '',
        '  Sanity Dashboard ready in 1.2s',
        '',
        '    Organization  Acme',
        '    App           Reports',
        `    URL           ${link}`,
        '    Version       local preview',
        '',
      ].join('\n'),
    )
  })

  test('labels a studio and names the deploy action', () => {
    const summary = formatDashboardSummary({
      action: 'deployed',
      durationMs: 800,
      isApp: false,
      title: 'Federated Studio',
      url,
    })

    expect(summary).toContain('  Sanity Dashboard deployed in 0.8s')
    expect(summary).toContain('    Studio  Federated Studio')
  })

  test('shows only the URL when nothing else is known', () => {
    const summary = formatDashboardSummary({action: 'ready', durationMs: 800, isApp: true, url})

    expect(summary.split('\n').slice(3)).toEqual([`    URL  ${link}`, ''])
  })
})

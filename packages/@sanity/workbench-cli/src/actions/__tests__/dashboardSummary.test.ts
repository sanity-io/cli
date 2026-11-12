import {styleText} from 'node:util'

import {describe, expect, test} from 'vitest'

import {formatDashboardSummary} from '../dashboardSummary.js'

describe('formatDashboardSummary', () => {
  const url = 'http://localhost:3333/applications/test-app'
  const link = styleText(['blue', 'underline'], url)

  test('lists organization, app, URL and deployed version under the ready line', () => {
    const summary = formatDashboardSummary({
      durationMs: 1234,
      heading: 'Sanity Dashboard ready',
      isApp: true,
      organizationId: 'oAbc123',
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

  test('labels a studio under the given heading', () => {
    const summary = formatDashboardSummary({
      durationMs: 800,
      heading: 'Federated Studio deployed',
      isApp: false,
      title: 'Federated Studio',
      url,
    })

    expect(summary).toContain('  Federated Studio deployed in 0.8s')
    expect(summary).toContain('    Studio  Federated Studio')
  })

  test('falls back to the organization id when the name is unknown', () => {
    const summary = formatDashboardSummary({
      durationMs: 800,
      heading: 'Sanity Dashboard ready',
      isApp: true,
      organizationId: 'oAbc123',
      url,
    })

    expect(summary).toContain('    Organization  oAbc123')
  })

  test('shows only the URL when nothing else is known', () => {
    const summary = formatDashboardSummary({
      durationMs: 800,
      heading: 'Sanity Dashboard ready',
      isApp: true,
      url,
    })

    expect(summary.split('\n').slice(3)).toEqual([`    URL  ${link}`, ''])
  })
})

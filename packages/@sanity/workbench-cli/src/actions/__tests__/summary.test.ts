import {styleText} from 'node:util'

import {describe, expect, test} from 'vitest'

import {formatSummary} from '../summary.js'

const url = 'http://localhost:3333/applications/reports'
const link = styleText(['blue', 'underline'], url)

describe('formatSummary', () => {
  test('lists organization, title, URL and version under the heading', () => {
    expect(
      formatSummary({
        durationMs: 1234,
        heading: 'Sanity Dashboard ready',
        isApp: true,
        organization: 'Acme',
        title: 'Reports',
        url,
        version: 'local preview',
      }),
    ).toBe(
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

  test('omits the title and version rows when they are unknown', () => {
    expect(
      formatSummary({
        durationMs: 800,
        heading: 'Studio deployed',
        isApp: false,
        organization: 'org-1',
        url,
      }),
    ).toBe(
      [
        '',
        '  Studio deployed in 0.8s',
        '',
        '    Organization  org-1',
        `    URL           ${link}`,
        '',
      ].join('\n'),
    )
  })

  test('labels a studio title row', () => {
    expect(
      formatSummary({
        durationMs: 800,
        heading: 'Studio deployed',
        isApp: false,
        organization: 'org-1',
        title: 'Blog',
        url,
      }),
    ).toContain('\n    Studio        Blog\n')
  })
})

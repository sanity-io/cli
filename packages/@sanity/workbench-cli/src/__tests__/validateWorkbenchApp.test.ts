import {describe, expect, test} from 'vitest'

import {formatWorkbenchAppErrors, validateWorkbenchApp} from '../validateWorkbenchApp.js'

/** A minimal valid app; spread overrides to vary the fields under test. */
const app = (overrides: Record<string, unknown> = {}) => ({
  organizationId: 'org-1',
  slug: 'test-app',
  title: 'Test App',
  ...overrides,
})

const panel = {name: 'feed', src: './src/Feed.tsx', surface: 'panel', title: 'feed'}

describe('validateWorkbenchApp', () => {
  test('returns no errors for a valid app', () => {
    expect(validateWorkbenchApp(app({views: [panel]}))).toEqual([])
  })

  test('validates the whole input, not just interfaces', () => {
    expect(validateWorkbenchApp(app({slug: 'Bad Slug!'}))).toContainEqual(
      expect.stringMatching(/slug: App `slug` must be lowercase/),
    )
  })

  test('accepts an app view alongside a panel view', () => {
    expect(validateWorkbenchApp(app({entry: './src/App.tsx', views: [panel]}))).toEqual([])
  })

  test('accepts multiple panel views', () => {
    expect(
      validateWorkbenchApp(
        app({
          views: [panel, {name: 'inbox', src: './src/Inbox.tsx', surface: 'panel', title: 'inbox'}],
        }),
      ),
    ).toEqual([])
  })

  test('locates a malformed declaration', () => {
    expect(validateWorkbenchApp(app({views: [{...panel, name: 'views/feed'}]}))).toContainEqual(
      expect.stringMatching(/views\.0\.name: View `name` must match/),
    )
  })

  test('collects every error at once so they can be fixed together', () => {
    const errors = validateWorkbenchApp(
      app({
        slug: 'bad!',
        views: [panel, {...panel, src: './src/Inbox.tsx'}],
      }),
    )
    expect(errors).toContainEqual(expect.stringMatching(/slug: App `slug` must be lowercase/))
    expect(errors).toContainEqual(expect.stringContaining('View `name` must be unique'))
  })
})

describe('formatWorkbenchAppErrors', () => {
  test('renders every error as a single message', () => {
    expect(formatWorkbenchAppErrors(['first', 'second'])).toBe(
      'Invalid workbench app config:\n  - first\n  - second',
    )
  })
})

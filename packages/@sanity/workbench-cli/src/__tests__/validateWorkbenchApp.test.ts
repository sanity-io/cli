import {describe, expect, test} from 'vitest'

import {formatWorkbenchAppErrors, validateWorkbenchApp} from '../validateWorkbenchApp.js'

/** A minimal valid app; spread overrides to vary the fields under test. */
const app = (overrides: Record<string, unknown> = {}) => ({
  name: 'test-app',
  organizationId: 'org-1',
  slug: 'test-app',
  title: 'Test App',
  ...overrides,
})

const panel = {name: 'feed', src: './src/Feed.tsx', type: 'panel'}

describe('validateWorkbenchApp', () => {
  test('returns no errors for a valid app', () => {
    expect(validateWorkbenchApp(app({views: [panel]}))).toEqual([])
  })

  test('validates the whole input, not just interfaces', () => {
    expect(validateWorkbenchApp(app({name: 'bad name!'}))).toContainEqual(
      expect.stringMatching(/name: App `name` must match/),
    )
  })

  test('reports the app-view / panel exclusion', () => {
    expect(validateWorkbenchApp(app({entry: './src/App.tsx', views: [panel]}))).toContainEqual(
      expect.stringContaining('cannot expose both an app view (`entry`) and panel views'),
    )
  })

  test('reports more than one panel view', () => {
    expect(
      validateWorkbenchApp(
        app({views: [panel, {name: 'inbox', src: './src/Inbox.tsx', type: 'panel'}]}),
      ),
    ).toContainEqual(expect.stringContaining('at most one panel view'))
  })

  test('locates a malformed declaration', () => {
    expect(validateWorkbenchApp(app({views: [{...panel, name: 'views/feed'}]}))).toContainEqual(
      expect.stringMatching(/views\.0\.name: View `name` must match/),
    )
  })

  test('collects every error at once so they can be fixed together', () => {
    const errors = validateWorkbenchApp(
      app({
        entry: './src/App.tsx',
        name: 'bad!',
        views: [panel, {name: 'inbox', src: './src/Inbox.tsx', type: 'panel'}],
      }),
    )
    expect(errors).toContainEqual(expect.stringMatching(/name: App `name` must match/))
    expect(errors).toContainEqual(expect.stringContaining('cannot expose both an app view'))
    expect(errors).toContainEqual(expect.stringContaining('at most one panel view'))
  })
})

describe('formatWorkbenchAppErrors', () => {
  test('renders every error as a single message', () => {
    expect(formatWorkbenchAppErrors(['first', 'second'])).toBe(
      'Invalid workbench app config:\n  - first\n  - second',
    )
  })
})

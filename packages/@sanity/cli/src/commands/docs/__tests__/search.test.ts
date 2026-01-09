import {runCommand} from '@oclif/test'
import {select} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DocsSearchCommand} from '../search.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
  }
})

const mockedIsInteractive = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    isInteractive: mockedIsInteractive,
  }
})

const mockedSelect = vi.mocked(select)

afterEach(() => {
  const pending = nock.pendingMocks()
  nock.cleanAll()
  expect(pending, 'pending mocks').toEqual([])
  vi.resetAllMocks()
})

describe('#docs:search', () => {
  test('--help works', async () => {
    const {stdout} = await runCommand('docs search --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Search Sanity docs

      USAGE
        $ sanity docs search QUERY [--limit <value>]

      ARGUMENTS
        QUERY  Search query for documentation

      FLAGS
        --limit=<value>  [default: 10] Maximum number of results to return

      DESCRIPTION
        Search Sanity docs

      EXAMPLES
        Search for documentation about schemas

          $ sanity docs search schema

        Search with phrase

          $ sanity docs search "groq functions"

        Limit search results

          $ sanity docs search "deployment" --limit=5

      "
    `)
  })

  test('searches and displays results', async () => {
    const searchResponse = [
      {
        description: 'Learn how to install Sanity Studio',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
      {
        description: 'Understanding Sanity schemas',
        path: '/docs/schemas/overview',
        title: 'Schema Overview',
      },
    ]

    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    const {stdout} = await testCommand(DocsSearchCommand, ['studio'])

    expect(stdout).toContain('Searching documentation for: "studio"')
    expect(stdout).toContain('Found 2 result(s):')
    expect(stdout).toContain('1. Studio Installation Guide')
    expect(stdout).toContain('URL: https://www.sanity.io/docs/studio/installation')
    expect(stdout).toContain('Learn how to install Sanity Studio')
    expect(stdout).toContain('2. Schema Overview')
  })

  test('handles no results', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'nonexistent'})
      .reply(200, [])

    const {stdout} = await testCommand(DocsSearchCommand, ['nonexistent'])

    expect(stdout).toContain('Searching documentation for: "nonexistent"')
    expect(stdout).toContain('No results found. Try a different search term.')
  })

  test('handles API errors', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'test'})
      .reply(500, 'Internal Server Error')

    const {error} = await testCommand(DocsSearchCommand, ['test']).catch((err) => err)
    expect(error.message).toBe(
      'The documentation search API is currently unavailable. Please try again later.',
    )
    expect(error.oclif?.exit).toBe(1)
  })

  test('respects limit flag', async () => {
    const searchResponse = [
      {
        description: 'Learn how to install Sanity Studio 1',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
      {
        description: 'Learn how to install Sanity Studio 2',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
      {
        description: 'Learn how to install Sanity Studio 3',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },

      {
        description: 'Learn how to install Sanity Studio 4',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
      {
        description: 'Learn how to install Sanity Studio 5',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
      {
        description: 'Learn how to install Sanity Studio 6',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
    ]

    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    const {stdout} = await testCommand(DocsSearchCommand, ['studio', '--limit=3'])

    expect(stdout).toContain('Found 3 result(s):')
    expect(stdout).toContain('1. Studio Installation Guide')
    expect(stdout).toContain('2. Studio Installation Guide')
    expect(stdout).toContain('3. Studio Installation Guide')
  })

  test('handles results with empty descriptions', async () => {
    const searchResponse = [
      {
        description: '', // Empty description
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
      {
        description: '', // Empty description
        path: '/docs/schemas/overview',
        title: 'Schema Overview',
      },
    ]

    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    const {stdout} = await testCommand(DocsSearchCommand, ['studio'])

    expect(stdout).toContain('Searching documentation for: "studio"')
    expect(stdout).toContain('Found 2 result(s):')
    expect(stdout).toContain('1. Studio Installation Guide')
    expect(stdout).toContain('URL: https://www.sanity.io/docs/studio/installation')
    expect(stdout).toContain('2. Schema Overview')
    // Should not show empty description lines
    expect(stdout).not.toContain('Learn how to install')
    expect(stdout).not.toContain('Understanding Sanity schemas')
  })

  test('shows usage hints in non-interactive mode', async () => {
    const searchResponse = [
      {
        description: 'Learn how to install Sanity Studio',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
    ]

    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    mockedIsInteractive.mockReturnValue(false)

    const {stdout} = await testCommand(DocsSearchCommand, ['studio'])

    expect(stdout).toContain('Found 1 result(s):')
    expect(stdout).toContain('Use `sanity docs read <url>` to read an article in terminal.')
    expect(stdout).toContain('Use `sanity docs read <path>` to follow links found within articles.')
  })

  test('handles network errors with default message', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'test'})
      .reply(500, 'Internal Server Error')

    const {error} = await testCommand(DocsSearchCommand, ['test']).catch((err) => err)
    expect(error.message).toBe(
      'The documentation search API is currently unavailable. Please try again later.',
    )
    expect(error.oclif?.exit).toBe(1)
  })

  test('handles interactive mode article selection', async () => {
    mockedSelect.mockResolvedValue(0)

    const searchResponse = [
      {
        description: 'Learn how to install Sanity Studio',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
    ]

    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    nock('https://www.sanity.io')
      .get('/docs/studio/installation.md')
      .reply(200, '# Studio Installation\n\nThis is how you install the studio.')

    mockedIsInteractive.mockReturnValue(true)

    const {stdout} = await testCommand(DocsSearchCommand, ['studio'])

    expect(stdout).toContain('Found 1 result(s):')
    expect(stdout).toContain('---')
    expect(stdout).toContain('# Studio Installation')
    expect(stdout).toContain('This is how you install the studio.')
  })

  test('handles interactive mode exit selection', async () => {
    mockedSelect.mockResolvedValue(-1) // User selects exit option

    const searchResponse = [
      {
        description: 'Learn how to install Sanity Studio',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
    ]

    nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    mockedIsInteractive.mockReturnValue(true)

    const {stdout} = await testCommand(DocsSearchCommand, ['studio'])

    expect(stdout).toContain('Found 1 result(s):')
    expect(stdout).not.toContain('---') // Should not show article content
    expect(stdout).not.toContain('# Studio Installation')
  })
})

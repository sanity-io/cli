import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test} from 'vitest'

import {DocsSearchCommand} from '../search.js'

afterEach(() => {
  const pending = nock.pendingMocks()
  nock.cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#docs:search', () => {
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

    const result = await testCommand(DocsSearchCommand, ['test']).catch((err) => err)
    expect(result.error.message).toBe(
      'The documentation search API is currently unavailable. Please try again later.',
    )
  })

  test('respects limit flag', async () => {
    const searchResponse = [
      {
        description: 'Learn how to install Sanity Studio',
        path: '/docs/studio/installation',
        title: 'Studio Installation Guide',
      },
    ]

    const scope = nock('https://www.sanity.io')
      .get('/docs/api/search/semantic')
      .query({query: 'studio'})
      .reply(200, searchResponse)

    await testCommand(DocsSearchCommand, ['studio', '--limit=5'])

    expect(scope.isDone()).toBe(true)
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('docs search --help')
    expect(stdout).toContain('Search Sanity docs')
    expect(stdout).toContain('ARGUMENTS')
    expect(stdout).toContain('query')
    expect(stdout).toContain('Search query for documentation')
    expect(stdout).toContain('FLAGS')
    expect(stdout).toContain('--limit')
  })
})

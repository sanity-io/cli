import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DocsReadCommand} from '../read.js'

vi.mock('open')

const mockOpen = vi.mocked(open)

afterEach(() => {
  const pending = pendingMocks()
  cleanAll()
  vi.clearAllMocks()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#docs:read', () => {
  test('reads article and displays content', async () => {
    const markdownContent = '# Installation\n\nThis is the installation guide.'

    nock('https://www.sanity.io').get('/docs/studio/installation.md').reply(200, markdownContent, {
      'Content-Type': 'text/plain',
    })

    const {stdout} = await testCommand(DocsReadCommand, ['/docs/studio/installation'])

    expect(stdout).toContain('Reading article: /docs/studio/installation')
    expect(stdout).toContain('---')
    expect(stdout).toContain('# Installation')
    expect(stdout).toContain('This is the installation guide.')
  })

  test('opens in web browser with --web flag', async () => {
    const {stdout} = await testCommand(DocsReadCommand, ['/docs/studio/installation', '--web'])

    expect(stdout).toContain('Opening https://www.sanity.io/docs/studio/installation')
    expect(mockOpen).toHaveBeenCalledWith('https://www.sanity.io/docs/studio/installation')
    // Note: readDoc might be called due to import, so we don't check for not called
  })

  test('opens in web browser with -w flag', async () => {
    const {stdout} = await testCommand(DocsReadCommand, ['/docs/studio/installation', '-w'])

    expect(stdout).toContain('Opening https://www.sanity.io/docs/studio/installation')
    expect(mockOpen).toHaveBeenCalledWith('https://www.sanity.io/docs/studio/installation')
  })

  test('reads full Sanity URLs', async () => {
    const markdownContent = '# Installation\n\nContent here.'

    nock('https://www.sanity.io').get('/docs/studio/installation.md').reply(200, markdownContent, {
      'Content-Type': 'text/plain',
    })

    const {stdout} = await testCommand(DocsReadCommand, [
      'https://www.sanity.io/docs/studio/installation',
    ])

    expect(stdout).toContain('Reading article: /docs/studio/installation')
    expect(stdout).toContain('# Installation')
  })

  test('reads full URLs using their pathname', async () => {
    const markdownContent = '# Installation\n\nContent here.'

    nock('https://www.sanity.io').get('/docs/studio/installation.md').reply(200, markdownContent, {
      'Content-Type': 'text/plain',
    })

    const {stdout} = await testCommand(DocsReadCommand, [
      'https://docs.sanity.io/docs/studio/installation?utm_source=cli#requirements',
    ])

    expect(stdout).toContain('Reading article: /docs/studio/installation')
    expect(stdout).toContain('# Installation')
  })

  test('opens full URLs with query strings and fragments', async () => {
    const {stdout} = await testCommand(DocsReadCommand, [
      'https://docs.sanity.io/docs/studio/installation?utm_source=cli#requirements',
      '--web',
    ])

    const url = 'https://www.sanity.io/docs/studio/installation?utm_source=cli#requirements'

    expect(stdout).toContain(`Opening ${url}`)
    expect(mockOpen).toHaveBeenCalledWith(url)
  })

  test('opens path inputs with query strings and fragments', async () => {
    const {stdout} = await testCommand(DocsReadCommand, [
      '/docs/studio/installation?utm_source=cli#requirements',
      '--web',
    ])

    const url = 'https://www.sanity.io/docs/studio/installation?utm_source=cli#requirements'

    expect(stdout).toContain(`Opening ${url}`)
    expect(mockOpen).toHaveBeenCalledWith(url)
  })

  test('rejects lookalike Sanity URLs', async () => {
    const inputs = [
      'https://www.sanity.io.evil.example/docs/studio/installation',
      'https://evil-sanity.io/docs/studio/installation',
      'https://www.sanity.io@evil.example/docs/studio/installation',
    ]

    for (const input of inputs) {
      const result = await testCommand(DocsReadCommand, [input]).catch((err) => err)
      expect(result.error.message).toContain(
        'Invalid path or URL. Expected a Sanity docs path or URL.',
      )
      expect(result.error.oclif.exit).toBe(exitCodes.USAGE_ERROR)
    }
  })

  test('handles invalid paths', async () => {
    const result = await testCommand(DocsReadCommand, ['invalid-path']).catch((err) => err)
    expect(result.error.message).toContain(
      'Invalid path or URL. Expected a Sanity docs path or URL.',
    )
    expect(result.error.oclif.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('handles API errors', async () => {
    nock('https://www.sanity.io').get('/docs/nonexistent.md').reply(404, 'Not Found')

    const result = await testCommand(DocsReadCommand, ['/docs/nonexistent']).catch((err) => err)
    expect(result.error.message).toBe('Article not found: /docs/nonexistent')
  })
})

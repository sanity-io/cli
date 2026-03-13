import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveIcon} from '../iconResolver.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
  }
})

function createMockStream(html: string) {
  const encoded = new TextEncoder().encode(html)
  let read = false
  return {
    allReady: Promise.resolve(),
    getReader: () => ({
      read: async () => {
        if (read) return {done: true, value: undefined}
        read = true
        return {done: false, value: encoded}
      },
    }),
  }
}

describe('resolveIcon', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves react-dom/server from the studio workDir, not the CLI', async () => {
    const mockRenderToReadableStream = vi
      .fn()
      .mockResolvedValue(
        createMockStream('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
      )
    mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
      if (pkg === 'react-dom/server') return {renderToReadableStream: mockRenderToReadableStream}
      throw new Error(`Unexpected package resolution: ${pkg}`)
    })

    await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(mockResolveLocalPackage).toHaveBeenCalledWith('react-dom/server', '/studio/project')
  })

  test('uses the resolved renderToReadableStream for rendering', async () => {
    const mockRenderToReadableStream = vi
      .fn()
      .mockResolvedValue(
        createMockStream('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
      )
    mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
      if (pkg === 'react-dom/server') return {renderToReadableStream: mockRenderToReadableStream}
      throw new Error(`Unexpected package resolution: ${pkg}`)
    })

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(mockRenderToReadableStream).toHaveBeenCalledOnce()
    expect(result).toContain('<svg')
    expect(result).toContain('<path')
  })

  test('sanitizes the rendered HTML output', async () => {
    const maliciousHtml =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><path d="M0 0"/></svg>'
    mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
      if (pkg === 'react-dom/server') {
        return {renderToReadableStream: vi.fn().mockResolvedValue(createMockStream(maliciousHtml))}
      }
      throw new Error(`Unexpected package resolution: ${pkg}`)
    })

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(result).not.toContain('<script>')
    expect(result).toContain('<path')
  })

  test('returns null when package resolution fails', async () => {
    mockResolveLocalPackage.mockRejectedValue(
      new Error('Failed to resolve package "react-dom/server"'),
    )

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(result).toBeNull()
  })

  test('returns null when rendering throws', async () => {
    mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
      if (pkg === 'react-dom/server') {
        return {renderToReadableStream: vi.fn().mockRejectedValue(new Error('Render error'))}
      }
      throw new Error(`Unexpected package resolution: ${pkg}`)
    })

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(result).toBeNull()
  })
})

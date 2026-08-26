import {createElement} from 'react'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveIcon} from '../iconResolver.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())
const mockResolveLocalPackageFrom = vi.hoisted(() => vi.fn())
const mockResolveLocalPackagePath = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
    resolveLocalPackageFrom: mockResolveLocalPackageFrom,
    resolveLocalPackagePath: mockResolveLocalPackagePath,
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

function MockThemeProvider({children}: {children: unknown}) {
  return children
}

const fakeSanityUrl = new URL('file:///studio/project/node_modules/sanity/dist/index.js')

function setupMocks(mockRenderToReadableStream: ReturnType<typeof vi.fn>) {
  const buildTheme = vi.fn().mockReturnValue({color: 'mock-theme'})
  const createDefaultIcon = vi.fn().mockReturnValue(createElement('span', null, 'default'))

  mockResolveLocalPackagePath.mockImplementation((pkg: string) => {
    if (pkg === 'sanity') return fakeSanityUrl
    throw new Error(`Unexpected resolveLocalPackagePath call: ${pkg}`)
  })

  mockResolveLocalPackageFrom.mockImplementation(async (pkg: string) => {
    switch (pkg) {
      case '@sanity/ui': {
        return {ThemeProvider: MockThemeProvider}
      }
      case '@sanity/ui/theme': {
        return {buildTheme}
      }
      default: {
        throw new Error(`Unexpected resolveLocalPackageFrom call: ${pkg}`)
      }
    }
  })

  mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
    switch (pkg) {
      case 'react-dom/server': {
        return {renderToReadableStream: mockRenderToReadableStream}
      }
      case 'sanity': {
        return {createDefaultIcon}
      }
      default: {
        throw new Error(`Unexpected resolveLocalPackage call: ${pkg}`)
      }
    }
  })
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
    setupMocks(mockRenderToReadableStream)

    await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(mockResolveLocalPackage).toHaveBeenCalledWith('react-dom/server', '/studio/project')
  })

  test('uses the resolved renderToReadableStream for rendering', async () => {
    const mockRenderToReadableStream = vi
      .fn()
      .mockResolvedValue(
        createMockStream('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
      )
    setupMocks(mockRenderToReadableStream)

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(mockRenderToReadableStream).toHaveBeenCalledOnce()
    expect(result).toContain('<svg')
    expect(result).toContain('<path')
  })

  test('sanitizes the rendered HTML output', async () => {
    const maliciousHtml =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><path d="M0 0"/></svg>'
    setupMocks(vi.fn().mockResolvedValue(createMockStream(maliciousHtml)))

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(result).not.toContain('<script>')
    expect(result).toContain('<path')
  })

  test('returns null when package resolution fails', async () => {
    mockResolveLocalPackagePath.mockImplementation(() => {
      throw new Error('Failed to resolve package "sanity"')
    })

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(result).toBeNull()
  })

  test('returns null when rendering throws', async () => {
    setupMocks(vi.fn().mockRejectedValue(new Error('Render error')))

    const result = await resolveIcon({title: 'Test', workDir: '/studio/project'})

    expect(result).toBeNull()
  })
})

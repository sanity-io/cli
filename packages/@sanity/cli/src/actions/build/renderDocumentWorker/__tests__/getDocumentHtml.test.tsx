import {type MessagePort} from 'node:worker_threads'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {buildDebug} from '../../buildDebug.js'
import {addTimestampedImportMapScriptToHtml} from '../addTimestampImportMapScriptToHtml.js'
import {getDocumentComponent} from '../getDocumentComponent.js'
import {getDocumentHtml} from '../getDocumentHtml.js'
import {type DocumentProps} from '../types.js'

// Type definitions for testing
interface MockReactElementProps {
  basePath?: string
  css?: string[]
  entryPath?: string
}

interface MockReactElement {
  props: MockReactElementProps
}

interface MockDocumentComponentProps {
  entryPath: string

  basePath?: string
  css?: string[]
}

// Mock dependencies
vi.mock('../../buildDebug.js')
vi.mock('../addTimestampImportMapScriptToHtml.js')
vi.mock('../getDocumentComponent.js')
vi.mock('react-dom/server', () => ({
  renderToStaticMarkup: vi.fn(),
}))

const mockBuildDebug = vi.mocked(buildDebug)
const mockAddTimestampedImportMapScriptToHtml = vi.mocked(addTimestampedImportMapScriptToHtml)
const mockGetDocumentComponent = vi.mocked(getDocumentComponent)

// Mock react-dom/server
const mockRenderToStaticMarkup = vi.mocked(await import('react-dom/server')).renderToStaticMarkup

// Create a mock React component for testing
const MockDocumentComponent = ({
  basePath: _basePath,
  css,
  entryPath,
}: MockDocumentComponentProps) => {
  return `<html><head><title>Test</title>${css?.map((href: string) => `<link rel="stylesheet" href="${href}" />`).join('')}</head><body><script src="${entryPath}" type="module"></script></body></html>`
}

describe('getDocumentHtml', () => {
  let mockParent: MessagePort

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a mock MessagePort
    mockParent = {
      addEventListener: vi.fn(),
      close: vi.fn(),
      dispatchEvent: vi.fn(),
      onmessage: null,
      onmessageerror: null,
      postMessage: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
    } as never

    // Setup default mocks
    mockGetDocumentComponent.mockResolvedValue(MockDocumentComponent)
    mockRenderToStaticMarkup.mockImplementation((_element) => {
      // Simple mock implementation that just returns a string
      return '<html><head><title>Test</title></head><body><script src="./.sanity/runtime/app.js" type="module"></script></body></html>'
    })
    mockAddTimestampedImportMapScriptToHtml.mockImplementation((html) => html)
  })

  describe('basic functionality', () => {
    test('should return HTML with default props when no props provided', async () => {
      const result = await getDocumentHtml(mockParent, '/mock/studio/path')

      expect(result).toBe(
        '<!DOCTYPE html><html><head><title>Test</title></head><body><script src="./.sanity/runtime/app.js" type="module"></script></body></html>',
      )
      expect(mockGetDocumentComponent).toHaveBeenCalledWith(
        mockParent,
        '/mock/studio/path',
        undefined,
      )
      expect(mockBuildDebug).toHaveBeenCalledWith('Rendering document component using React')
      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockAddTimestampedImportMapScriptToHtml).toHaveBeenCalled()
    })

    test('should pass isApp parameter to getDocumentComponent', async () => {
      await getDocumentHtml(mockParent, '/mock/studio/path', undefined, undefined, true)

      expect(mockGetDocumentComponent).toHaveBeenCalledWith(mockParent, '/mock/studio/path', true)
    })

    test('should use custom props when provided', async () => {
      const props: DocumentProps = {
        basePath: '/custom',
        css: ['./style.css'],
        entryPath: './custom/entry.js',
      }

      mockRenderToStaticMarkup.mockReturnValue(
        '<html><head><title>Custom</title><link rel="stylesheet" href="/custom/style.css" /></head><body><script src="./custom/entry.js" type="module"></script></body></html>',
      )

      const result = await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(result).toBe(
        '<!DOCTYPE html><html><head><title>Custom</title><link rel="stylesheet" href="/custom/style.css" /></head><body><script src="./custom/entry.js" type="module"></script></body></html>',
      )
    })

    test('should handle importMap parameter', async () => {
      const importMap = {imports: {react: './react.js'}}
      const htmlWithImportMap = '<html>...</html>'

      mockAddTimestampedImportMapScriptToHtml.mockReturnValue(htmlWithImportMap)

      const result = await getDocumentHtml(mockParent, '/mock/studio/path', undefined, importMap)

      expect(mockAddTimestampedImportMapScriptToHtml).toHaveBeenCalledWith(
        expect.any(String),
        importMap,
      )
      expect(result).toBe(`<!DOCTYPE html>${htmlWithImportMap}`)
    })
  })

  describe('CSS path processing', () => {
    test('should process relative CSS paths with basePath', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
        css: ['style.css', '/absolute.css'],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(processedCss).toEqual(['/studio/style.css', '/studio/absolute.css'])
    })

    test('should handle basePath with trailing slash', async () => {
      const props: DocumentProps = {
        basePath: '/studio/',
        css: ['style.css', '/absolute.css'],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(processedCss).toEqual(['/studio/style.css', '/studio/absolute.css'])
    })

    test('should handle basePath without leading slash', async () => {
      const props: DocumentProps = {
        basePath: 'studio',
        css: ['style.css'],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(processedCss).toEqual(['/studio/style.css'])
    })

    test('should preserve absolute URLs in CSS paths', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
        css: ['https://cdn.example.com/style.css', 'http://example.com/theme.css'],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(processedCss).toEqual([
        'https://cdn.example.com/style.css',
        'http://example.com/theme.css',
      ])
    })

    test('should handle mixed relative and absolute CSS paths', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
        css: [
          'local.css',
          'https://cdn.example.com/remote.css',
          '/root-relative.css',
          'subfolder/nested.css',
        ],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(processedCss).toEqual([
        '/studio/local.css',
        'https://cdn.example.com/remote.css',
        '/studio/root-relative.css',
        '/studio/subfolder/nested.css',
      ])
    })

    test('should handle empty CSS array', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
        css: [],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(processedCss).toEqual([])
    })

    test('should work without CSS property', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
      }

      let elementProps: MockReactElementProps | undefined
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        elementProps = mockElement.props
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(elementProps?.css).toBeUndefined()
    })
  })

  describe('edge cases and error handling', () => {
    test('should handle getDocumentComponent rejection', async () => {
      mockGetDocumentComponent.mockRejectedValue(new Error('Component loading failed'))

      await expect(getDocumentHtml(mockParent, '/mock/studio/path')).rejects.toThrow(
        'Component loading failed',
      )
    })

    test('should handle renderToStaticMarkup throwing', async () => {
      mockRenderToStaticMarkup.mockImplementation(() => {
        throw new Error('Render failed')
      })

      await expect(getDocumentHtml(mockParent, '/mock/studio/path')).rejects.toThrow(
        'Render failed',
      )
    })

    test('should handle malformed URLs in CSS gracefully', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
        css: ['valid.css', '://malformed-url', 'another.css'],
      }

      let processedCss: string[] = []
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        processedCss = mockElement.props.css || []
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      // Should process valid URLs and handle malformed ones
      expect(processedCss).toEqual([
        '/studio/valid.css',
        '/studio/://malformed-url', // Malformed URL gets basePath treatment
        '/studio/another.css',
      ])
    })

    test('should pass all props to Document component', async () => {
      const props: DocumentProps = {
        basePath: '/custom',
        css: ['./style.css'],
        entryPath: './custom/entry.js',
      }

      let componentProps: MockReactElementProps | undefined
      mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
        const mockElement = element as MockReactElement
        componentProps = mockElement.props
        return '<html>...</html>'
      })

      await getDocumentHtml(mockParent, '/mock/studio/path', props)

      expect(componentProps).toMatchObject({
        basePath: '/custom',
        css: ['/custom/./style.css'], // The function correctly preserves the ./ prefix
        entryPath: './custom/entry.js',
      })
    })
  })

  describe('complex scenarios', () => {
    test('should handle all parameters together', async () => {
      const props: DocumentProps = {
        basePath: '/my-studio',
        css: [
          'theme.css',
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
        ],
        entryPath: './custom/app.js',
      }
      const importMap = {imports: {react: './react.esm.js'}}
      const isApp = true

      const expectedHtml = '<html>Custom HTML with imports</html>'
      mockAddTimestampedImportMapScriptToHtml.mockReturnValue(expectedHtml)

      const result = await getDocumentHtml(mockParent, '/studio/path', props, importMap, isApp)

      expect(mockGetDocumentComponent).toHaveBeenCalledWith(mockParent, '/studio/path', true)
      expect(mockAddTimestampedImportMapScriptToHtml).toHaveBeenCalledWith(
        expect.any(String),
        importMap,
      )
      expect(result).toBe(`<!DOCTYPE html>${expectedHtml}`)
    })
  })
})

// Test the internal _prefixUrlWithBasePath function by testing its behavior through getDocumentHtml
describe('URL prefixing behavior (via getDocumentHtml)', () => {
  let mockParent: MessagePort

  beforeEach(() => {
    vi.clearAllMocks()

    mockParent = {
      addEventListener: vi.fn(),
      close: vi.fn(),
      dispatchEvent: vi.fn(),
      onmessage: null,
      onmessageerror: null,
      postMessage: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
    } as never

    mockGetDocumentComponent.mockResolvedValue(MockDocumentComponent)
    mockAddTimestampedImportMapScriptToHtml.mockImplementation((html) => html)
  })

  test('should handle URL starting with slash and basePath ending with slash', async () => {
    const props: DocumentProps = {
      basePath: '/studio/',
      css: ['/styles.css'],
    }

    let processedCss: string[] = []
    mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
      const mockElement = element as MockReactElement
      processedCss = mockElement.props.css || []
      return '<html>...</html>'
    })

    await getDocumentHtml(mockParent, '/mock/path', props)

    expect(processedCss).toEqual(['/studio/styles.css'])
  })

  test('should handle URL starting with slash and basePath not ending with slash', async () => {
    const props: DocumentProps = {
      basePath: '/studio',
      css: ['/styles.css'],
    }

    let processedCss: string[] = []
    mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
      const mockElement = element as MockReactElement
      processedCss = mockElement.props.css || []
      return '<html>...</html>'
    })

    await getDocumentHtml(mockParent, '/mock/path', props)

    expect(processedCss).toEqual(['/studio/styles.css'])
  })

  test('should handle URL not starting with slash and basePath ending with slash', async () => {
    const props: DocumentProps = {
      basePath: '/studio/',
      css: ['styles.css'],
    }

    let processedCss: string[] = []
    mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
      const mockElement = element as MockReactElement
      processedCss = mockElement.props.css || []
      return '<html>...</html>'
    })

    await getDocumentHtml(mockParent, '/mock/path', props)

    expect(processedCss).toEqual(['/studio/styles.css'])
  })

  test('should handle URL not starting with slash and basePath not ending with slash', async () => {
    const props: DocumentProps = {
      basePath: '/studio',
      css: ['styles.css'],
    }

    let processedCss: string[] = []
    mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
      const mockElement = element as MockReactElement
      processedCss = mockElement.props.css || []
      return '<html>...</html>'
    })

    await getDocumentHtml(mockParent, '/mock/path', props)

    expect(processedCss).toEqual(['/studio/styles.css'])
  })

  test('should handle basePath without leading slash', async () => {
    const props: DocumentProps = {
      basePath: 'studio',
      css: ['/styles.css', 'theme.css'],
    }

    let processedCss: string[] = []
    mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
      const mockElement = element as MockReactElement
      processedCss = mockElement.props.css || []
      return '<html>...</html>'
    })

    await getDocumentHtml(mockParent, '/mock/path', props)

    expect(processedCss).toEqual(['/studio/styles.css', '/studio/theme.css'])
  })

  test('should handle empty basePath', async () => {
    const props: DocumentProps = {
      basePath: '',
      css: ['/styles.css', 'theme.css'],
    }

    let processedCss: string[] = []
    mockRenderToStaticMarkup.mockImplementation((element: unknown) => {
      const mockElement = element as MockReactElement
      processedCss = mockElement.props.css || []
      return '<html>...</html>'
    })

    await getDocumentHtml(mockParent, '/mock/path', props)

    expect(processedCss).toEqual(['/styles.css', '/theme.css'])
  })
})

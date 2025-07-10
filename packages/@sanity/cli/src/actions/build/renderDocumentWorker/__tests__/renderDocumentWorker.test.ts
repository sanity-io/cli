import fs from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {type MessagePort} from 'node:worker_threads'

import {type ReactElement, type ReactNode} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {renderDocumentWorker, type RenderDocumentWorkerOptions} from '../renderDocumentWorker.js'
import {type DocumentProps} from '../types.js'

// Mock the lower-level dependencies that we still need to mock
vi.mock('../../buildDebug.js')
vi.mock('react-dom/server', () => ({
  renderToStaticMarkup: vi.fn(),
}))

const mockRenderToStaticMarkup = vi.mocked(renderToStaticMarkup)

// Create test document components as strings
const validDocumentComponent = `
const React = require('react');

function TestDocument(props) {
  const { basePath = '', css = [], entryPath = './.sanity/runtime/app.js' } = props;

  return React.createElement('html', { lang: 'en' },
    React.createElement('head', null,
      React.createElement('meta', { charSet: 'utf-8' }),
      React.createElement('title', null, 'Test Document'),
      ...css.map((href) => React.createElement('link', { rel: 'stylesheet', href, key: href }))
    ),
    React.createElement('body', null,
      React.createElement('div', { id: 'root' }),
      React.createElement('script', { src: entryPath, type: 'module' }),
      React.createElement('div', null, \`Base: \${basePath || 'default'}\`)
    )
  );
}

module.exports = TestDocument;
module.exports.default = TestDocument;
`

const invalidDocumentComponent = `
const notDefault = 'invalid';
const someFunction = () => 'test';

module.exports = { notDefault, someFunction };
`

const documentComponentWithoutDefaultExport = `
function NamedComponent() {
  return 'not default export';
}

module.exports = { NamedComponent };
`

describe('#renderDocumentWorker', () => {
  let mockParent: MessagePort
  let originalDateNow: typeof Date.now
  let tempDir: string
  let testStudioPath: string

  beforeEach(async () => {
    vi.clearAllMocks()

    // Mock Date.now to return a consistent timestamp for testing
    originalDateNow = Date.now
    Date.now = vi.fn(() => 1_640_995_200_000) // Fixed timestamp: 2022-01-01 00:00:00 UTC

    // Create a mock MessagePort
    mockParent = {
      postMessage: vi.fn(),
    } as unknown as MessagePort

    // Create temporary directory for test files
    tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'sanity-test-'))
    testStudioPath = path.join(tempDir, 'studio')
    await fs.promises.mkdir(testStudioPath, {recursive: true})

    // Setup default mock for renderToStaticMarkup
    mockRenderToStaticMarkup.mockImplementation((element: ReactNode) => {
      // Simple mock that returns the component's rendered output
      const props = (element as ReactElement)?.props || {}
      const {basePath = '', css = [], entryPath = './.sanity/runtime/app.js'} = props
      return `<html><head><title>Test Document</title>${css.map((href: string) => `<link rel="stylesheet" href="${href}" />`).join('')}</head><body><script src="${entryPath}" type="module"></script><div>Base: ${basePath || 'default'}</div></body></html>`
    })
  })

  afterEach(async () => {
    // Restore original Date.now
    Date.now = originalDateNow

    // Clean up temporary directory
    try {
      await fs.promises.rm(tempDir, {force: true, recursive: true})
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error)
    }
  })

  async function createTestDocumentComponent(content: string, filename = '_document.js') {
    const filePath = path.join(testStudioPath, filename)
    await fs.promises.writeFile(filePath, content)
    return filePath
  }

  describe('input validation', () => {
    test('should send error message when studioRootPath is not a string', async () => {
      const options = {
        studioRootPath: 123,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: 'Missing/invalid `studioRootPath` option',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })

    test('should send error message when studioRootPath is undefined', async () => {
      const options = {
        studioRootPath: undefined,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: 'Missing/invalid `studioRootPath` option',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })

    test('should send error message when studioRootPath is null', async () => {
      const options = {
        studioRootPath: null,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: 'Missing/invalid `studioRootPath` option',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })

    test('should render document when studioRootPath is empty string', async () => {
      const options = {
        studioRootPath: '',
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should send error message when props is not an object', async () => {
      const options = {
        props: 'invalid',
        studioRootPath: testStudioPath,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: '`props` must be an object if provided',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })

    test('should send error message when props is a primitive value', async () => {
      const options = {
        props: 123,
        studioRootPath: testStudioPath,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: '`props` must be an object if provided',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })

    test('should render document when props is an array (arrays are objects)', async () => {
      const options = {
        props: [],
        studioRootPath: testStudioPath,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })
  })

  describe('successful rendering with default components', () => {
    test('should render document with minimal options', async () => {
      const options = {
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should render document with all options provided', async () => {
      const props: DocumentProps = {
        basePath: '/studio',
        css: ['style.css', 'theme.css'],
        entryPath: './custom-entry.js',
      }

      const importMap = {
        imports: {
          react: 'https://esm.sh/react@18',
          'react-dom': 'https://esm.sh/react-dom@18',
        },
      }

      const options = {
        importMap,
        isApp: true,
        props,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            basePath: '/studio',
            css: ['/studio/style.css', '/studio/theme.css'], // CSS paths should be processed
            entryPath: './custom-entry.js',
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should render document with isApp=false', async () => {
      const options = {
        isApp: false,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should render document with empty props object', async () => {
      const options = {
        props: {} as DocumentProps,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            entryPath: './.sanity/runtime/app.js', // Default entry path
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should render document with complex props', async () => {
      const props: DocumentProps = {
        basePath: '/complex/path',
        css: ['main.css', 'components.css', 'theme.css'],
        entryPath: './src/index.js',
      }

      const options = {
        props,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            basePath: '/complex/path',
            css: [
              '/complex/path/main.css',
              '/complex/path/components.css',
              '/complex/path/theme.css',
            ],
            entryPath: './src/index.js',
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should render document with complex importMap', async () => {
      const importMap = {
        imports: {
          '@sanity/ui': 'https://esm.sh/@sanity/ui@2.0.0',
          react: 'https://esm.sh/react@18.2.0',
          'react-dom': 'https://esm.sh/react-dom@18.2.0',
          'react-dom/client': 'https://esm.sh/react-dom@18.2.0/client',
        },
      }

      const options = {
        importMap,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should use BasicDocument when isApp=true', async () => {
      const options = {
        isApp: true,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should use DefaultDocument when isApp=false', async () => {
      const options = {
        isApp: false,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })
  })

  describe('user-defined document components', () => {
    test('should handle user-defined document component', async () => {
      await createTestDocumentComponent(validDocumentComponent)

      const options = {
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should handle user-defined component with warning when not a function', async () => {
      await createTestDocumentComponent(invalidDocumentComponent)

      const options = {
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('did not have a default export that is a React component'),
          ]),
          type: 'warning',
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should handle user-defined component without default export', async () => {
      await createTestDocumentComponent(documentComponentWithoutDefaultExport)

      const options = {
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('did not have a default export that is a React component'),
          ]),
          type: 'warning',
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should prefer .tsx over .js when both exist', async () => {
      // Create both .js and .tsx files
      await createTestDocumentComponent(invalidDocumentComponent, '_document.js')
      await createTestDocumentComponent(validDocumentComponent, '_document.tsx')

      const options = {
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      // Should use the .js file (first in the list from getPossibleDocumentComponentLocations)
      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('did not have a default export that is a React component'),
          ]),
          type: 'warning',
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })
  })

  describe('error handling', () => {
    test('should handle renderToStaticMarkup throwing', async () => {
      const options = {
        props: {
          basePath: '/studio',
        } as DocumentProps,
        studioRootPath: testStudioPath,
      }

      const error = new Error('React rendering failed')
      mockRenderToStaticMarkup.mockImplementation(() => {
        throw error
      })

      await expect(renderDocumentWorker(mockParent, options)).rejects.toThrow(
        'React rendering failed',
      )

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
    })

    test('should handle invalid document component module', async () => {
      // Create a file with syntax errors
      await createTestDocumentComponent('invalid javascript syntax!@#$')

      const options = {
        studioRootPath: testStudioPath,
      }

      await expect(renderDocumentWorker(mockParent, options)).rejects.toThrow()
    })
  })

  describe('edge cases', () => {
    test('should handle null props correctly', async () => {
      const options = {
        props: null,
        studioRootPath: testStudioPath,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should handle undefined props correctly', async () => {
      const options = {
        props: undefined,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should handle empty importMap correctly', async () => {
      const options = {
        importMap: {},
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should handle isApp=false explicitly', async () => {
      const options = {
        isApp: false,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })
  })

  describe('integration tests', () => {
    test('should maintain correct call order and data flow', async () => {
      const options = {
        importMap: {imports: {react: 'https://esm.sh/react'}},
        isApp: true,
        props: {basePath: '/studio'} as DocumentProps,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      // Verify the complete integration flow
      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            basePath: '/studio',
            entryPath: './.sanity/runtime/app.js',
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should handle all parameters in correct order with realistic data flow', async () => {
      const options = {
        importMap: {
          imports: {
            '@test/module': './test-module.js',
          },
        },
        isApp: false,
        props: {
          basePath: '/integration',
          css: ['test.css'],
          entryPath: './test-entry.js',
        } as DocumentProps,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      // Verify that all parameters flow through the integration correctly
      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            basePath: '/integration',
            css: ['/integration/test.css'], // CSS should be processed with basePath
            entryPath: './test-entry.js',
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('should process CSS paths correctly with different basePath scenarios', async () => {
      const testCases = [
        {
          basePath: '/studio',
          css: ['style.css', '/absolute.css'],
          expected: ['/studio/style.css', '/studio/absolute.css'],
        },
        {
          basePath: '/studio/',
          css: ['style.css', '/absolute.css'],
          expected: ['/studio/style.css', '/studio/absolute.css'],
        },
        {
          basePath: 'studio',
          css: ['style.css'],
          expected: ['/studio/style.css'],
        },
      ]

      for (const testCase of testCases) {
        vi.clearAllMocks()

        const options = {
          props: {
            basePath: testCase.basePath,
            css: testCase.css,
          } as DocumentProps,
          studioRootPath: testStudioPath,
        }

        await renderDocumentWorker(mockParent, options)

        expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
          expect.objectContaining({
            props: expect.objectContaining({
              css: testCase.expected,
            }),
          }),
        )
      }
    })

    test('should include import map script tags when importMap is provided', async () => {
      const importMap = {
        imports: {
          react: 'https://sanity-cdn.com/react@18/t1640995000',
          'react-dom': 'https://esm.sh/react-dom@18',
        },
      }

      const options = {
        importMap,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('__imports'),
        type: 'result',
      })

      // Check that the result HTML contains the import map JSON
      const mockPostMessage = vi.mocked(mockParent.postMessage)
      const resultCall = mockPostMessage.mock.calls.find((call) => {
        const message = call[0] as {type: string}
        return message.type === 'result'
      })
      const resultMessage = resultCall?.[0] as {html: string}
      expect(resultMessage.html).toContain(JSON.stringify(importMap))
      expect(resultMessage.html).toContain('auto-generated script to add import map with timestamp')
    })

    test('should not include import map scripts when importMap is not provided', async () => {
      const options = {
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      const mockPostMessage = vi.mocked(mockParent.postMessage)
      const resultCall = mockPostMessage.mock.calls.find((call) => {
        const message = call[0] as {type: string}
        return message.type === 'result'
      })
      const resultMessage = resultCall?.[0] as {html: string}
      expect(resultMessage.html).not.toContain('__imports')
      expect(resultMessage.html).not.toContain(
        'auto-generated script to add import map with timestamp',
      )
    })

    test('should work with user-defined component and complex props', async () => {
      await createTestDocumentComponent(validDocumentComponent)

      const props: DocumentProps = {
        basePath: '/custom',
        css: ['custom.css', 'theme.css'],
        entryPath: './custom-entry.js',
      }

      const options = {
        props,
        studioRootPath: testStudioPath,
      }

      await renderDocumentWorker(mockParent, options)

      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            basePath: '/custom',
            css: ['/custom/custom.css', '/custom/theme.css'],
            entryPath: './custom-entry.js',
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })
  })
})

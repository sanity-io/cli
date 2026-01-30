import {randomUUID} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {type MessagePort} from 'node:worker_threads'

import {getTempPath} from '@sanity/cli-test'
import {type ReactElement, type ReactNode} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {renderDocumentWorker, type RenderDocumentWorkerOptions} from '../renderDocumentWorker.js'
import {type DocumentProps} from '../types.js'

vi.mock('react-dom/server', () => ({
  renderToStaticMarkup: vi.fn(),
}))

const mockRenderToStaticMarkup = vi.mocked(renderToStaticMarkup)

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

describe('#renderDocumentWorker', () => {
  let mockParent: MessagePort
  let originalDateNow: typeof Date.now
  let tempDir: string
  let testStudioPath: string

  beforeEach(async () => {
    vi.clearAllMocks()

    originalDateNow = Date.now
    Date.now = vi.fn(() => 1_640_995_200_000)

    mockParent = {
      postMessage: vi.fn(),
    } as unknown as MessagePort

    const vitestTempDir = getTempPath()
    const uniqueId = randomUUID().slice(0, 8)
    tempDir = path.join(vitestTempDir, `renderWorker-test-${uniqueId}`)
    await mkdir(tempDir, {recursive: true})

    testStudioPath = path.join(tempDir, 'studio')
    await mkdir(testStudioPath, {recursive: true})

    mockRenderToStaticMarkup.mockImplementation((element: ReactNode) => {
      const props = (element as ReactElement<DocumentProps>)?.props || {}
      const {basePath = '', css = [], entryPath = './.sanity/runtime/app.js'} = props
      return `<html><head><title>Test Document</title>${css.map((href: string) => `<link rel="stylesheet" href="${href}" />`).join('')}</head><body><script src="${entryPath}" type="module"></script><div>Base: ${basePath || 'default'}</div></body></html>`
    })
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  async function createTestDocumentComponent(content: string, filename = '_document.js') {
    const filePath = path.join(testStudioPath, filename)
    await writeFile(filePath, content)
    return filePath
  }

  describe('input validation', () => {
    test.each([
      {description: 'number', value: 123},
      {description: 'undefined', value: undefined},
      {description: 'null', value: null},
    ])('rejects invalid studioRootPath ($description)', async ({value}) => {
      const options = {studioRootPath: value} as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: 'Missing/invalid `studioRootPath` option',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })

    test.each([
      {description: 'string', value: 'invalid string'},
      {description: 'number', value: 123},
    ])('rejects invalid props ($description)', async ({value}) => {
      const options = {
        props: value,
        studioRootPath: testStudioPath,
      } as unknown as RenderDocumentWorkerOptions

      await renderDocumentWorker(mockParent, options)

      expect(mockParent.postMessage).toHaveBeenCalledWith({
        message: '`props` must be an object if provided',
        type: 'error',
      })
      expect(mockRenderToStaticMarkup).not.toHaveBeenCalled()
    })
  })

  describe('successful rendering', () => {
    test('renders document with minimal options', async () => {
      await renderDocumentWorker(mockParent, {studioRootPath: testStudioPath})

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('renders document with all options and processes CSS paths', async () => {
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

      await renderDocumentWorker(mockParent, {
        importMap,
        isApp: true,
        props,
        studioRootPath: testStudioPath,
      })

      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            basePath: '/studio',
            css: ['/studio/style.css', '/studio/theme.css'],
            entryPath: './custom-entry.js',
          }),
        }),
      )
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('uses default entry path when props is empty', async () => {
      await renderDocumentWorker(mockParent, {
        props: {} as DocumentProps,
        studioRootPath: testStudioPath,
      })

      expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            entryPath: './.sanity/runtime/app.js',
          }),
        }),
      )
    })

    test.each([
      {basePath: '/studio', css: ['style.css'], expected: ['/studio/style.css']},
      {basePath: '/studio/', css: ['style.css'], expected: ['/studio/style.css']},
      {basePath: 'studio', css: ['style.css'], expected: ['/studio/style.css']},
      {basePath: '/app', css: ['/absolute.css'], expected: ['/app/absolute.css']},
    ])(
      'processes CSS paths correctly with basePath=$basePath',
      async ({basePath, css, expected}) => {
        await renderDocumentWorker(mockParent, {
          props: {basePath, css} as DocumentProps,
          studioRootPath: testStudioPath,
        })

        expect(mockRenderToStaticMarkup).toHaveBeenCalledWith(
          expect.objectContaining({
            props: expect.objectContaining({css: expected}),
          }),
        )
      },
    )
  })

  describe('import map handling', () => {
    test('includes import map script when importMap is provided', async () => {
      const importMap = {
        imports: {
          react: 'https://sanity-cdn.com/react@18/t1640995000',
        },
      }

      await renderDocumentWorker(mockParent, {importMap, studioRootPath: testStudioPath})

      const mockPostMessage = vi.mocked(mockParent.postMessage)
      const resultCall = mockPostMessage.mock.calls.find((call) => {
        const message = call[0] as {type: string}
        return message.type === 'result'
      })
      const resultMessage = resultCall?.[0] as {html: string}

      expect(resultMessage.html).toContain('__imports')
      expect(resultMessage.html).toContain(JSON.stringify(importMap))
    })

    test('does not include import map script when importMap is not provided', async () => {
      await renderDocumentWorker(mockParent, {studioRootPath: testStudioPath})

      const mockPostMessage = vi.mocked(mockParent.postMessage)
      const resultCall = mockPostMessage.mock.calls.find((call) => {
        const message = call[0] as {type: string}
        return message.type === 'result'
      })
      const resultMessage = resultCall?.[0] as {html: string}

      expect(resultMessage.html).not.toContain('__imports')
    })
  })

  describe('user-defined document components', () => {
    test('uses valid user-defined document component', async () => {
      await createTestDocumentComponent(validDocumentComponent)

      await renderDocumentWorker(mockParent, {studioRootPath: testStudioPath})

      expect(mockRenderToStaticMarkup).toHaveBeenCalled()
      expect(mockParent.postMessage).toHaveBeenCalledWith({
        html: expect.stringContaining('<!DOCTYPE html>'),
        type: 'result',
      })
    })

    test('falls back with warning when user component has no valid default export', async () => {
      await createTestDocumentComponent(invalidDocumentComponent)

      await renderDocumentWorker(mockParent, {studioRootPath: testStudioPath})

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
    test('propagates renderToStaticMarkup errors', async () => {
      mockRenderToStaticMarkup.mockImplementation(() => {
        throw new Error('React rendering failed')
      })

      await expect(
        renderDocumentWorker(mockParent, {
          props: {basePath: '/studio'} as DocumentProps,
          studioRootPath: testStudioPath,
        }),
      ).rejects.toThrow('React rendering failed')
    })

    test('throws on invalid document component syntax', async () => {
      await createTestDocumentComponent('invalid javascript syntax!@#$')

      await expect(
        renderDocumentWorker(mockParent, {studioRootPath: testStudioPath}),
      ).rejects.toThrow()
    })
  })
})

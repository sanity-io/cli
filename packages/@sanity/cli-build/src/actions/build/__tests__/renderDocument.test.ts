import {randomUUID} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {getTempPath} from '@sanity/cli-test'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {renderDocument} from '../renderDocument.js'

const mockTsxWorkerTask = vi.hoisted(() => vi.fn())
const mockWarn = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/tasks', () => ({tsxWorkerTask: mockTsxWorkerTask}))
vi.mock('@oclif/core', () => ({ux: {warn: mockWarn}}))

describe('renderDocument', () => {
  let studioRootPath: string

  beforeEach(async () => {
    vi.clearAllMocks()
    mockTsxWorkerTask.mockResolvedValue({html: '<html></html>', type: 'result'})

    studioRootPath = path.join(getTempPath(), `renderDocument-test-${randomUUID().slice(0, 8)}`)
    await mkdir(studioRootPath, {recursive: true})
  })

  test('returns the html rendered by the worker', async () => {
    await expect(renderDocument({studioRootPath})).resolves.toBe('<html></html>')
  })

  test.each([undefined, true, false])(
    'forwards documentComponent=%s to the worker',
    async (documentComponent) => {
      await renderDocument({documentComponent, studioRootPath})

      expect(mockTsxWorkerTask).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          workerData: expect.objectContaining({documentComponent, studioRootPath}),
        }),
      )
    },
  )

  test('does not warn about _document files when custom document components are enabled', async () => {
    await writeFile(path.join(studioRootPath, '_document.tsx'), '')

    await renderDocument({studioRootPath})
    await renderDocument({documentComponent: true, studioRootPath})

    expect(mockWarn).not.toHaveBeenCalled()
  })

  test('does not warn when disabled and no _document file exists', async () => {
    await renderDocument({documentComponent: false, studioRootPath})

    expect(mockWarn).not.toHaveBeenCalled()
  })

  test('warns once per ignored _document file when disabled', async () => {
    await writeFile(path.join(studioRootPath, '_document.js'), '')
    await writeFile(path.join(studioRootPath, '_document.tsx'), '')

    await renderDocument({documentComponent: false, studioRootPath})
    await renderDocument({documentComponent: false, studioRootPath})

    expect(mockWarn).toHaveBeenCalledTimes(2)
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('_document.js'))
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('_document.tsx'))
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('`vite` option'))
  })

  test('surfaces worker warnings and returns an empty document', async () => {
    mockTsxWorkerTask.mockResolvedValue({
      message: ['first', 'second'],
      type: 'warning',
      warnKey: `warning-${randomUUID()}`,
    })

    await expect(renderDocument({studioRootPath})).resolves.toBe('')
    expect(mockWarn).toHaveBeenCalledWith('first')
    expect(mockWarn).toHaveBeenCalledWith('second')
  })

  test('throws worker errors', async () => {
    mockTsxWorkerTask.mockResolvedValue({message: 'boom', type: 'error'})

    await expect(renderDocument({studioRootPath})).rejects.toThrow('boom')
  })
})

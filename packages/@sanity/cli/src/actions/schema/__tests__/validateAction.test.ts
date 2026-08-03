import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import * as taskMocks from '@sanity/cli-test/mocks/cli-core/tasks'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {validateAction} from '../validateAction'

const mockAggregateSev = vi.hoisted(() => vi.fn())
const mockGenMetafile = vi.hoisted(() => vi.fn())
const mockWriteFile = vi.hoisted(() => vi.fn())
const mockFormatValidation = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFile,
}))
vi.mock('@sanity/cli-build/_internal/extract', () => ({
  formatSchemaValidation: mockFormatValidation,
  getAggregatedSeverity: mockAggregateSev,
}))
vi.mock('@sanity/cli-core/tasks', () => import('@sanity/cli-test/mocks/cli-core/tasks'))
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../metafile.js', () => ({
  generateMetafile: mockGenMetafile,
}))
vi.mock('../validateSchema.worker.js', () => ({}))

const output = createMockOutput()
const workDir = '/some/dir'
const baseOptions = {output, workDir}
const debugMetafileContents = {debug: 'this bug'}

describe('validateAction', () => {
  beforeEach(() => {
    taskMocks.studioWorkerTask.mockResolvedValue({serializedDebug: [], validation: []})
    mockAggregateSev.mockReturnValue('info')
    mockGenMetafile.mockReturnValue(debugMetafileContents)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('sad paths', () => {
    test('should throw if debugMetafilePath provided, did not fail schema validation and did not produce serializedDebug', async () => {
      mockAggregateSev.mockReturnValue('info')
      taskMocks.studioWorkerTask.mockResolvedValue({
        serializedDebug: false,
        validation: [{problems: [{message: 'uh oh', severity: 'info'}]}],
      })

      await expect(validateAction({...baseOptions, debugMetafilePath: 'yesplz'})).rejects.toThrow(
        'serializedDebug should always be produced',
      )
    })

    test('should throw if schema validation failed', async () => {
      mockAggregateSev.mockReturnValue('error')
      taskMocks.studioWorkerTask.mockResolvedValue({
        serializedDebug: false,
        validation: [{problems: [{message: 'uh oh', severity: 'error'}]}],
      })

      await expect(validateAction({...baseOptions, format: 'json'})).rejects.toThrow(
        'Schema validation failed',
      )
    })
  })

  describe('happy paths', () => {
    test('should output validation result in json format', async () => {
      const validation = [{problems: [{message: 'uh oh', severity: 'error'}]}]
      taskMocks.studioWorkerTask.mockResolvedValue({
        serializedDebug: false,
        validation,
      })

      await validateAction({...baseOptions, format: 'json'})

      expect(output.log).toHaveBeenCalledWith(JSON.stringify(validation))
    })

    test('should output validation result in ndjson format, one per validation group', async () => {
      const validation = [
        {problems: [{message: 'uh oh', severity: 'error'}]},
        {problems: [{message: 'yikes', severity: 'warn'}]},
      ]
      taskMocks.studioWorkerTask.mockResolvedValue({
        serializedDebug: false,
        validation,
      })

      await validateAction({...baseOptions, format: 'ndjson'})

      for (const group of validation) {
        expect(output.log).toHaveBeenCalledWith(JSON.stringify(group))
      }
    })
  })

  test('should output both errors and warnings by default', async () => {
    const validation = [
      {problems: [{message: 'uh oh', severity: 'error'}]},
      {problems: [{message: 'yikes', severity: 'warning'}]},
    ]
    taskMocks.studioWorkerTask.mockResolvedValue({
      serializedDebug: false,
      validation,
    })

    await validateAction(baseOptions)

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Validation results'))
    expect(output.log).toHaveBeenCalledWith(expect.stringMatching(/Errors:\s+1 error/))
    expect(output.log).toHaveBeenCalledWith(expect.stringMatching(/Warnings:\s+1 warning/))
    expect(mockFormatValidation).toHaveBeenCalledWith(validation)
  })

  test('should output only errors with level:error', async () => {
    const validation = [
      {problems: [{message: 'uh oh', severity: 'error'}]},
      {problems: [{message: 'yikes', severity: 'warning'}]},
    ]
    taskMocks.studioWorkerTask.mockResolvedValue({
      serializedDebug: false,
      validation,
    })

    await validateAction({...baseOptions, level: 'error'})

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Validation results'))
    expect(output.log).toHaveBeenCalledWith(expect.stringMatching(/Errors:\s+1 error/))
    expect(output.log).not.toHaveBeenCalledWith(expect.stringMatching(/Warnings:\s+1 warning/))
    expect(mockFormatValidation).toHaveBeenCalledWith(validation)
  })

  test('should create metafile with debugMetafilePath on successful validation', async () => {
    const validation = [
      {problems: [{message: 'uh oh', severity: 'warning'}]},
      {problems: [{message: 'yikes', severity: 'warning'}]},
    ]
    const debugMetafilePath = '/some/meta/path'
    const serializedDebug = 'bugs in a row'
    taskMocks.studioWorkerTask.mockResolvedValue({
      serializedDebug,
      validation,
    })

    await validateAction({...baseOptions, debugMetafilePath})

    expect(mockGenMetafile).toHaveBeenCalledWith(serializedDebug)
    expect(mockWriteFile).toHaveBeenCalledWith(
      debugMetafilePath,
      JSON.stringify(debugMetafileContents),
      'utf8',
    )
  })
})

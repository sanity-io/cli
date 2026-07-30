import {describe, expect, test, vi} from 'vitest'

import {createTypegenProgressRenderer} from '../renderTypegenProgress.js'

function createFakeSpinner() {
  const calls: {method: string; text?: string}[] = []
  const spin = {
    fail: vi.fn((text?: string) => {
      calls.push({method: 'fail', text})
      return spin
    }),
    isSpinning: true,
    start: vi.fn((text?: string) => {
      calls.push({method: 'start', text})
      return spin
    }),
    succeed: vi.fn((text?: string) => {
      calls.push({method: 'succeed', text})
      return spin
    }),
    text: '',
    warn: vi.fn((text?: string) => {
      calls.push({method: 'warn', text})
      return spin
    }),
  }
  return {calls, spin}
}

const result = {
  code: 'x',
  duration: 12,
  emptyUnionTypeNodesGenerated: 0,
  filesWithErrors: 0,
  outputSize: 1,
  queriesCount: 3,
  queryFilesCount: 2,
  schemaTypesCount: 4,
  typeNodesGenerated: 5,
  unknownTypeNodesGenerated: 0,
  unknownTypeNodesRatio: 0,
}

describe('createTypegenProgressRenderer', () => {
  test('succeeds spinner on schemaLoaded and on complete', () => {
    const {calls, spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: false,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({type: 'schemaLoaded'})
    render({expectedFileCount: 2, type: 'typegenStarted'})
    render({schemaTypesCount: 4, type: 'schemaTypesGenerated'})
    render({
      errors: [],
      evaluatedFiles: 2,
      expectedFileCount: 2,
      queriesCount: 3,
      queryFilesCount: 2,
      type: 'moduleEvaluated',
    })
    render({result, type: 'complete'})

    expect(spin.succeed).toHaveBeenCalledWith(
      expect.stringContaining('Schema loaded from schema.json'),
    )
    const success = calls.find(
      (c) => c.method === 'succeed' && c.text?.includes('Successfully generated'),
    )
    expect(success?.text).toContain('sanity.types.ts')
  })

  test('fails spinner for each module error', () => {
    const {spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: false,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({
      errors: ['boom'],
      evaluatedFiles: 1,
      expectedFileCount: 1,
      queriesCount: 0,
      queryFilesCount: 0,
      type: 'moduleEvaluated',
    })

    expect(spin.fail).toHaveBeenCalledWith('boom')
  })

  test('sets spinner text on formatting', () => {
    const {spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: true,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({formatterName: 'prettier', type: 'formatting'})

    expect(spin.text).toBe('Formatting generated types with prettier…')
  })

  test('warns on formatFailed', () => {
    const {spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: true,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({formatterName: 'prettier', message: 'unexpected token', type: 'formatFailed'})

    expect(spin.warn).toHaveBeenCalledWith(
      'Failed to format generated types with prettier: unexpected token',
    )
  })

  test('warns about files with errors before succeeding on complete', () => {
    const {calls, spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: false,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({result: {...result, filesWithErrors: 2}, type: 'complete'})

    expect(spin.warn).toHaveBeenCalledWith('Encountered errors in 2 files while generating types')

    const warnIndex = calls.findIndex((c) => c.method === 'warn')
    const succeedIndex = calls.findIndex((c) => c.method === 'succeed')
    expect(warnIndex).toBeGreaterThanOrEqual(0)
    expect(succeedIndex).toBeGreaterThan(warnIndex)
  })

  test('success text mentions the formatter used when formatting succeeded', () => {
    const {spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: true,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({formatterName: 'prettier', type: 'formatting'})
    render({result, type: 'complete'})

    expect(spin.succeed).toHaveBeenCalledWith(
      expect.stringContaining('formatted the generated code with prettier'),
    )
  })

  test('success text mentions a formatting error when formatting failed', () => {
    const {spin} = createFakeSpinner()
    const render = createTypegenProgressRenderer(spin, {
      formatGeneratedCode: true,
      generates: 'sanity.types.ts',
      schema: 'schema.json',
    })

    render({formatterName: 'prettier', message: 'unexpected token', type: 'formatFailed'})
    render({result, type: 'complete'})

    expect(spin.succeed).toHaveBeenCalledWith(
      expect.stringContaining('an error occurred during formatting'),
    )
  })
})

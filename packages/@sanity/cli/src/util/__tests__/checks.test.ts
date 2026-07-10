import {type Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {
  checkStatusIcon,
  createCollectingReporter,
  createFailFastReporter,
  renderIssues,
  runStep,
} from '../checks.js'

const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

describe('createFailFastReporter', () => {
  test('a fail exits with its exit code', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({exitCode: 2, message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 2})
  })

  test('a fail without an exit code defaults to 1', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'boom', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 1})
  })

  test('a warn prints and does not exit', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'heads up', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up')
    expect(output.error).not.toHaveBeenCalled()
  })

  test('pass and skip are silent', () => {
    const output = mockOutput()
    const reporter = createFailFastReporter(output)
    reporter.report({message: 'good', status: 'pass'})
    reporter.report({message: 'skipped', status: 'skip'})
    expect(output.error).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('a fail appends its solution to the message', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'boom', solution: 'do X', status: 'fail'})
    expect(output.error).toHaveBeenCalledWith('boom: do X', {exit: 1})
  })

  test('a warn appends its solution to the message', () => {
    const output = mockOutput()
    createFailFastReporter(output).report({message: 'heads up', solution: 'do Y', status: 'warn'})
    expect(output.warn).toHaveBeenCalledWith('heads up: do Y')
  })
})

describe('createCollectingReporter', () => {
  test('collects every reported check on results', () => {
    const reporter = createCollectingReporter()
    reporter.report({message: 'ok', status: 'pass'})
    reporter.report({message: 'bad', status: 'fail'})
    expect(reporter.results).toHaveLength(2)
  })
})

describe('runStep', () => {
  test('returns the value when the work succeeds', async () => {
    const reporter = createCollectingReporter()
    const result = await runStep(reporter, {name: 'ok', work: async () => 42})
    expect(result).toBe(42)
    expect(reporter.results).toHaveLength(0)
  })

  test('a throw becomes a fail check and returns null', async () => {
    const reporter = createCollectingReporter()
    const result = await runStep(reporter, {
      name: 'boom',
      work: async () => {
        throw new Error('nope')
      },
    })
    expect(result).toBeNull()
    expect(reporter.results[0]).toMatchObject({status: 'fail'})
    expect(reporter.results[0]?.message).toContain('nope')
  })

  test('uses a custom formatError for the fail message', async () => {
    const reporter = createCollectingReporter()
    await runStep(reporter, {
      formatError: () => 'friendly',
      name: 'boom',
      work: async () => {
        throw new Error('raw')
      },
    })
    expect(reporter.results[0]?.message).toBe('friendly')
  })

  test('attaches the solution to the fail check', async () => {
    const reporter = createCollectingReporter()
    await runStep(reporter, {
      name: 'boom',
      solution: 'try again',
      work: async () => {
        throw new Error('nope')
      },
    })
    expect(reporter.results[0]?.solution).toBe('try again')
  })
})

describe('renderIssues', () => {
  test('prints nothing for an empty list', () => {
    const output = mockOutput()
    renderIssues(output, 'Problems to fix:', [])
    expect(output.log).not.toHaveBeenCalled()
  })

  test('prints the title and each check with its fix', () => {
    const output = mockOutput()
    renderIssues(output, 'Problems to fix:', [
      {message: 'boom', solution: 'do X', status: 'fail'},
      {message: 'heads up', status: 'warn'},
    ])
    expect(output.log).toHaveBeenCalledWith('\nProblems to fix:')
    expect(output.log).toHaveBeenCalledWith(`  ${checkStatusIcon('fail')} boom: do X`)
    expect(output.log).toHaveBeenCalledWith(`  ${checkStatusIcon('warn')} heads up`)
  })
})

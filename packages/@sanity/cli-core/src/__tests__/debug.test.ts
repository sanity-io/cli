import {afterEach, describe, expect, test, vi} from 'vitest'

import {debug, subdebug} from '../_exports/debug.js'
import {runWithCliExecutionContext} from '../executionContext.js'

describe('debug', () => {
  const originalEnabled = debug.enabled

  afterEach(() => {
    debug.enabled = originalEnabled
    vi.restoreAllMocks()
  })

  test('does not write to host stderr inside an execution context', () => {
    debug.enabled = true
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    runWithCliExecutionContext({}, () => debug('secret request body'))

    expect(write).not.toHaveBeenCalled()
  })

  test('subdebug instances inherit execution-context suppression', () => {
    const child = subdebug('test')
    child.enabled = true
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    runWithCliExecutionContext({}, () => child('secret response body'))

    expect(write).not.toHaveBeenCalled()
  })

  test('keeps regular CLI debug output unchanged', () => {
    debug.enabled = true
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    debug('visible outside context')

    expect(write).toHaveBeenCalledOnce()
    expect(write.mock.calls[0][0]).toContain('visible outside context')
  })
})

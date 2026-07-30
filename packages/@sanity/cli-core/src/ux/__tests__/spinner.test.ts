import {describe, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../executionContext.js'
import {spinner, spinnerPromise} from '../spinner.js'

describe('spinner', () => {
  test('is silent and chainable under an execution context', () => {
    const write = vi.spyOn(process.stderr, 'write')

    try {
      runWithCliExecutionContext({}, () => {
        const instance = spinner('Working').start()
        instance.text = 'Still working'
        expect(instance.succeed('Done')).toBe(instance)
        expect(instance.isSpinning).toBe(false)
      })
      expect(write).not.toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })

  test('runs spinner promise actions without process output under a context', async () => {
    const write = vi.spyOn(process.stderr, 'write')

    try {
      const result = await runWithCliExecutionContext({}, () =>
        spinnerPromise(async (instance) => {
          instance.text = 'Working'
          return 42
        }),
      )
      expect(result).toBe(42)
      expect(write).not.toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })
})

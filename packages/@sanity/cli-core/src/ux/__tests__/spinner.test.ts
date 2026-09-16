import {beforeEach, describe, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../executionContext.js'
import {spinner, spinnerPromise} from '../spinner.js'

const {oraMock, oraPromiseMock} = vi.hoisted(() => ({
  oraMock: vi.fn(),
  oraPromiseMock: vi.fn(),
}))

vi.mock('ora', () => ({
  default: oraMock,
  oraPromise: oraPromiseMock,
}))

describe('spinner', () => {
  beforeEach(() => {
    oraMock.mockClear()
    oraPromiseMock.mockClear()
  })

  test('defaults discardStdin to false so Ctrl+C keeps working', () => {
    spinner('Working')
    expect(oraMock).toHaveBeenCalledWith({discardStdin: false, text: 'Working'})

    spinner({text: 'Working'})
    expect(oraMock).toHaveBeenCalledWith({discardStdin: false, text: 'Working'})

    spinner()
    expect(oraMock).toHaveBeenCalledWith({discardStdin: false})
  })

  test('lets an explicit discardStdin option win', () => {
    spinner({discardStdin: true, text: 'Working'})
    expect(oraMock).toHaveBeenCalledWith({discardStdin: true, text: 'Working'})
  })

  test('applies the discardStdin default to spinnerPromise', async () => {
    oraPromiseMock.mockResolvedValue(42)

    await expect(spinnerPromise(Promise.resolve(42), 'Working')).resolves.toBe(42)
    expect(oraPromiseMock).toHaveBeenCalledWith(expect.any(Promise), {
      discardStdin: false,
      text: 'Working',
    })

    await spinnerPromise(Promise.resolve(42), {discardStdin: true, text: 'Working'})
    expect(oraPromiseMock).toHaveBeenLastCalledWith(expect.any(Promise), {
      discardStdin: true,
      text: 'Working',
    })
  })

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

  test('forwards persisted lines to the context stderr sink', () => {
    const lines: string[] = []

    runWithCliExecutionContext({stderr: (line) => lines.push(line)}, () => {
      const instance = spinner('Loading schema…').start()
      instance.text = 'Generating query types…'
      instance.succeed('Schema loaded from ./schema.json')
      instance.warn('Encountered errors in 2 files while generating types')
      instance.info('Nothing to do')
      instance.fail('Generation failed')
      instance.stopAndPersist({symbol: '→', text: 'Persisted'})
    })

    expect(lines).toEqual([
      '✔ Schema loaded from ./schema.json',
      '⚠ Encountered errors in 2 files while generating types',
      'ℹ Nothing to do',
      '✖ Generation failed',
      '→ Persisted',
    ])
  })

  test('persists the current text when no text is given, and skips empty lines', () => {
    const lines: string[] = []

    runWithCliExecutionContext({stderr: (line) => lines.push(line)}, () => {
      const instance = spinner({text: 'Loading schema…'}).start()
      instance.fail()
      instance.text = ''
      instance.succeed()
      instance.stopAndPersist()
    })

    expect(lines).toEqual(['✖ Loading schema…', '✔'])
  })

  test('renders prefix and suffix text around persisted lines', () => {
    const lines: string[] = []

    runWithCliExecutionContext({stderr: (line) => lines.push(line)}, () => {
      spinner({prefixText: () => '[typegen]', suffixText: '(1/2)', text: 'Working'}).succeed()
    })

    expect(lines).toEqual(['[typegen] ✔ Working (1/2)'])
  })

  test('falls back to the stdout sink and honors isSilent', () => {
    const stdout: string[] = []

    runWithCliExecutionContext({stdout: (line) => stdout.push(line)}, () => {
      spinner({text: 'Working'}).succeed('Done')
      spinner({isSilent: true, text: 'Quiet'}).succeed('Also done')
    })

    expect(stdout).toEqual(['✔ Done'])
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

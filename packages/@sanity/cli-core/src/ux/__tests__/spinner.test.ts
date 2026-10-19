import {beforeEach, describe, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../executionContext.js'
import {spinner, spinnerPromise} from '../spinner.js'

const {oraMock, oraPromiseMock} = vi.hoisted(() => ({
  oraMock: vi.fn(),
  oraPromiseMock: vi.fn(),
}))

const {stopStatus, updateStatus} = vi.hoisted(() => ({stopStatus: vi.fn(), updateStatus: vi.fn()}))
vi.mock('../terminalStatus.js', () => ({
  createTerminalStatus: () => ({stop: stopStatus, update: updateStatus}),
}))

vi.mock('ora', () => ({
  default: oraMock,
  oraPromise: oraPromiseMock,
}))

describe('spinner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    oraMock.mockReset()
    const instance = {
      isEnabled: true,
      isSpinning: false,
      render: vi.fn(function () {
        return instance
      }),
      start: vi.fn(function (text?: string) {
        instance.isSpinning = true
        if (text) instance.text = text
        return instance
      }),
      stop: vi.fn(function () {
        instance.isSpinning = false
        return instance
      }),
      text: '',
    }
    oraMock.mockReturnValue(instance)
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
    expect(oraPromiseMock).toHaveBeenCalledWith(expect.any(Function), {
      discardStdin: false,
      text: 'Working',
    })

    await spinnerPromise(Promise.resolve(42), {discardStdin: true, text: 'Working'})
    expect(oraPromiseMock).toHaveBeenLastCalledWith(expect.any(Function), {
      discardStdin: true,
      text: 'Working',
    })
  })

  test('reports spinner text on start and render, and releases status on stop', () => {
    const instance = spinner().start('Building')
    expect(updateStatus).toHaveBeenLastCalledWith({message: 'Building', state: 'working'})
    instance.text = 'Uploading'
    instance.render()
    expect(updateStatus).toHaveBeenLastCalledWith({message: 'Uploading', state: 'working'})
    expect(instance.stop()).toBe(instance)
    expect(stopStatus).toHaveBeenCalledOnce()
    updateStatus.mockClear()
    instance.render()
    expect(updateStatus).not.toHaveBeenCalled()
    instance.start('Again')
    expect(updateStatus).toHaveBeenLastCalledWith({message: 'Again', state: 'working'})
  })

  test('does not report a disabled spinner', () => {
    const instance = spinner()
    instance.isEnabled = false
    instance.start('Disabled')
    instance.render()
    expect(updateStatus).not.toHaveBeenCalled()
  })

  test('tracks the already-started spinner passed to promise actions', async () => {
    const instance = oraMock().start('Working')
    oraPromiseMock.mockImplementationOnce(async (action) => {
      try {
        return await action(instance)
      } finally {
        instance.stop()
      }
    })
    const action = vi.fn(async (spin) => {
      spin.text = 'Uploading'
      spin.render()
      return 42
    })
    await expect(spinnerPromise(action)).resolves.toBe(42)
    expect(updateStatus).toHaveBeenCalledWith({message: 'Working', state: 'working'})
    expect(updateStatus).toHaveBeenLastCalledWith({message: 'Uploading', state: 'working'})
    expect(stopStatus).toHaveBeenCalledOnce()
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

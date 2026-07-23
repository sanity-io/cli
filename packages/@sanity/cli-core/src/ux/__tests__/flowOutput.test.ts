import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createFlow} from '../flowOutput.js'

const mockIsInteractive = vi.hoisted(() => vi.fn())
const mockStart = vi.hoisted(() => vi.fn())
const mockSpinner = vi.hoisted(() => vi.fn())

vi.mock('../../util/isInteractive.js', () => ({
  isInteractive: mockIsInteractive,
}))
vi.mock('../spinner.js', () => ({
  spinner: mockSpinner,
}))

const stopAndPersist = vi.fn()
const {columns: origColumns, isTTY: origIsTTY} = process.stderr

function setStderr(isTTY: boolean, columns: number): void {
  Object.defineProperty(process.stderr, 'isTTY', {configurable: true, value: isTTY})
  Object.defineProperty(process.stderr, 'columns', {configurable: true, value: columns})
}

beforeEach(() => {
  mockIsInteractive.mockReturnValue(true)
  mockStart.mockReturnValue({stopAndPersist})
  mockSpinner.mockReturnValue({start: mockStart})
})

afterEach(() => {
  vi.clearAllMocks()
  setStderr(origIsTTY as boolean, origColumns as number)
})

describe('createFlow spin', () => {
  test('animates for an interactive run on a real stderr TTY', () => {
    setStderr(true, 80)

    createFlow(() => {})
      .spin('minting')
      .succeed('minted')

    expect(mockSpinner).toHaveBeenCalledTimes(1)
    expect(stopAndPersist).toHaveBeenCalledTimes(1)
  })

  test('prints a plain line instead of animating when not interactive', () => {
    setStderr(true, 80)
    mockIsInteractive.mockReturnValue(false)
    const lines: string[] = []

    createFlow((line = '') => lines.push(line)).spin('minting')

    expect(mockSpinner).not.toHaveBeenCalled()
    expect(lines[0]).toContain('minting')
  })

  test('degrades when stderr is not a TTY, or is a zero-width pty', () => {
    for (const [isTTY, columns] of [
      [false, 80],
      [true, 0],
    ] as const) {
      vi.clearAllMocks()
      mockIsInteractive.mockReturnValue(true)
      setStderr(isTTY, columns)
      createFlow(() => {}).spin('minting')
      expect(mockSpinner).not.toHaveBeenCalled()
    }
  })
})

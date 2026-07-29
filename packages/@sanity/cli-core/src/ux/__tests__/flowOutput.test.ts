import {stripVTControlCharacters} from 'node:util'

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
const {columns: origStdoutColumns, isTTY: origStdoutIsTTY} = process.stdout

function setStderr(isTTY: boolean, columns: number): void {
  Object.defineProperty(process.stderr, 'isTTY', {configurable: true, value: isTTY})
  Object.defineProperty(process.stderr, 'columns', {configurable: true, value: columns})
}

function setStdout(isTTY: boolean, columns: number): void {
  Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: isTTY})
  Object.defineProperty(process.stdout, 'columns', {configurable: true, value: columns})
}

beforeEach(() => {
  mockIsInteractive.mockReturnValue(true)
  mockStart.mockReturnValue({stopAndPersist})
  mockSpinner.mockReturnValue({start: mockStart})
})

afterEach(() => {
  vi.clearAllMocks()
  setStderr(origIsTTY as boolean, origColumns as number)
  setStdout(origStdoutIsTTY as boolean, origStdoutColumns as number)
})

describe('createFlow output', () => {
  test('wraps styled prose to the terminal width with a rail on every physical line', () => {
    setStdout(true, 20)
    const lines: string[] = []

    createFlow((line = '') => lines.push(line)).highlight(
      '\u001B[36mClaiming keeps everything you built and makes the dataset readable.\u001B[39m',
    )

    expect(lines.length).toBeGreaterThan(1)
    expect(stripVTControlCharacters(lines[0])).toMatch(/^◆ {2}/)
    expect(lines.slice(1).map((line) => stripVTControlCharacters(line))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^│ {2}/)]),
    )
    expect(lines.every((line) => stripVTControlCharacters(line).length <= 20)).toBe(true)
    expect(lines.map((line) => stripVTControlCharacters(line).slice(3)).join(' ')).toBe(
      'Claiming keeps everything you built and makes the dataset readable.',
    )
    expect(lines.every((line) => line.includes('\u001B[36m') && line.endsWith('\u001B[39m'))).toBe(
      true,
    )
  })

  test('keeps a long claim URL intact on one standalone TTY line', () => {
    setStdout(true, 20)
    const lines: string[] = []
    const url = `https://www.sanity.io/manage/claim/${'secret'.repeat(12)}`

    createFlow((line = '') => lines.push(line)).link(url)

    expect(lines).toHaveLength(1)
    expect(stripVTControlCharacters(lines[0])).toBe(`│  ${url}`)
    expect(lines[0]).not.toContain('\n')
    expect(lines[0]).toContain('\u001B]8;;')
  })

  test('wraps by terminal cell width without splitting long words', () => {
    setStdout(true, 10)
    const lines: string[] = []
    const flow = createFlow((line = '') => lines.push(stripVTControlCharacters(line)))

    flow.line('界界界 a')
    flow.line('unbreakable')

    expect(lines).toEqual(['│  界界界', '│  a', '│  unbreakable'])
  })

  test('prints a bare claim URL without control bytes when stdout is not a TTY', () => {
    setStdout(false, 20)
    const lines: string[] = []
    const url = 'https://www.sanity.io/manage/claim/secret'

    createFlow((line = '') => lines.push(line)).link(url)

    expect(lines).toEqual([`│  ${url}`])
    expect(lines[0]).toBe(stripVTControlCharacters(lines[0]))
  })

  test.each([
    ['TTY', true],
    ['non-TTY', false],
  ])('sanitizes ESC, BEL, and C1 controls in %s link output', (_, isTTY) => {
    setStdout(isTTY, 80)
    const lines: string[] = []
    const unsafeUrl = 'https://www.sanity.io/manage/claim/\u001B\u0007\u009Csecret'
    const sanitizedUrl = 'https://www.sanity.io/manage/claim/%1B%07%C2%9Csecret'

    createFlow((line = '') => lines.push(line)).link(unsafeUrl)

    expect(lines[0].slice(lines[0].indexOf('  ') + 2)).toBe(sanitizedUrl)
    expect(lines[0]).not.toContain('\u001B]8;;')
  })
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

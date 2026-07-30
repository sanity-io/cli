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
const {columns: originalStderrColumns, isTTY: originalStderrIsTTY} = process.stderr
const {columns: originalStdoutColumns, isTTY: originalStdoutIsTTY} = process.stdout

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
  setStderr(originalStderrIsTTY as boolean, originalStderrColumns as number)
  setStdout(originalStdoutIsTTY as boolean, originalStdoutColumns as number)
})

describe('createFlow output', () => {
  test.each([
    ['an 80-column TTY', true, 80],
    ['a wide TTY', true, 160],
    ['non-TTY output', false, 0],
  ])('keeps railed prose below 80 columns for %s', (_, isTTY, columns) => {
    setStdout(isTTY, columns)
    const lines: string[] = []
    const text =
      'Until then it is temporary: the project and everything in it is deleted at that deadline. ' +
      'Claiming is free, takes about a minute, and nothing you have built changes.'

    createFlow((line = '') => lines.push(stripVTControlCharacters(line))).line(text)

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => line.length < 80)).toBe(true)
    expect(lines.map((line) => line.slice(3)).join(' ')).toBe(text)
  })

  test('does not split an unbreakable value to satisfy the prose cap', () => {
    setStdout(true, 80)
    const lines: string[] = []
    const secret = `SANITY_AUTH_TOKEN="${'x'.repeat(100)}"`

    createFlow((line = '') => lines.push(stripVTControlCharacters(line))).line(secret)

    expect(lines).toEqual([`│  ${secret}`])
  })

  test('indents runnable commands beneath their action', () => {
    const lines: string[] = []

    createFlow((line = '') => lines.push(line)).command('npm run dev')

    expect(stripVTControlCharacters(lines[0])).toBe('│     $ npm run dev')
  })

  test('wraps prose with a rail while keeping a claim URL copy-safe', () => {
    setStdout(true, 20)
    const lines: string[] = []
    const flow = createFlow((line = '') => lines.push(line))

    flow.highlight('Claiming keeps everything you built and makes the dataset readable.')
    const url = `https://www.sanity.io/manage/claim/${'secret'.repeat(12)}`
    flow.link(url)

    expect(lines.length).toBeGreaterThan(2)
    expect(stripVTControlCharacters(lines[0])).toMatch(/^◆ {2}/)
    expect(lines.slice(1, -1).map((line) => stripVTControlCharacters(line))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^│ {2}/)]),
    )
    expect(stripVTControlCharacters(lines.at(-1) ?? '')).toBe(`│  ${url}`)
    expect(lines.at(-1)).not.toContain('\n')
  })

  test('prints a bare claim URL without control bytes when stdout is not a TTY', () => {
    setStdout(false, 80)
    const lines: string[] = []
    const url = 'https://www.sanity.io/manage/claim/secret'

    createFlow((line = '') => lines.push(line)).link(url)

    expect(lines).toEqual([`│  ${url}`])
    expect(lines[0]).toBe(stripVTControlCharacters(lines[0]))
  })
})

describe('createFlow spin', () => {
  test('animates for an interactive stderr TTY', () => {
    setStderr(true, 80)
    createFlow(() => {})
      .spin('minting')
      .succeed('minted')

    expect(mockSpinner).toHaveBeenCalledTimes(1)
    expect(stopAndPersist).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['succeed', 'minted', '◇  minted\n'],
    ['fail', 'mint failed', '✖  mint failed\n'],
  ] as const)('writes the non-interactive %s fallback only to stderr', (method, text, expected) => {
    mockIsInteractive.mockReturnValue(false)
    const stdout: string[] = []
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      createFlow((line = '') => stdout.push(line))
        .spin('minting')
        [method](text)

      expect(mockSpinner).not.toHaveBeenCalled()
      expect(stdout).toEqual([])
      expect(write.mock.calls.map(([chunk]) => stripVTControlCharacters(String(chunk)))).toEqual([
        '●  minting\n',
        expected,
      ])
    } finally {
      write.mockRestore()
    }
  })
})

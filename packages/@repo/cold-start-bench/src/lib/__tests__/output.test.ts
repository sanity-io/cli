import {describe, expect, test} from 'vitest'

import {analyzeOutput, toVisibleChars, visibleText} from '../output.ts'

const MARKER = /Fetching providers/

// Recorded shape of a cold `npx @sanity/cli init`, trimmed
const SPINNER = [
  {at: 320, data: '⠋'},
  {at: 400, data: '\u001B[1G'},
  {at: 400, data: '\u001B[0K⠹'},
  {at: 480, data: '\u001B[1G\u001B[0K⠸'},
]

describe('toVisibleChars', () => {
  test('drops escape sequences, carriage returns and spinner glyphs', () => {
    const chars = toVisibleChars([
      {at: 1, data: '\u001B[1mnpm\u001B[22m ⠋\r\n'},
      {at: 2, data: '\u001B]0;title\u0007ok'},
    ])
    expect(chars.map((c) => c.char).join('')).toBe('npm \nok')
    expect(chars.at(-1)?.at).toBe(2)
  })

  test('removes an escape sequence split across chunks', () => {
    const chars = toVisibleChars([
      {at: 1, data: 'a\u001B['},
      {at: 2, data: '33mb'},
    ])
    expect(chars).toEqual([
      {at: 1, char: 'a'},
      {at: 2, char: 'b'},
    ])
  })

  test('removes two-byte escapes', () => {
    expect(toVisibleChars([{at: 1, data: '\u001B7x\u001B8'}])).toEqual([{at: 1, char: 'x'}])
  })
})

describe('analyzeOutput', () => {
  test('waits for the entire prompt across chunks and lines', () => {
    const prompt = /Please log in[\s\S]*❯[\s\S]*SSO/
    const chunks = [
      {at: 1, data: 'Fetching providers\n'},
      {at: 100, data: '? Please log in\n❯ Google\n  GitHub\n  S'},
    ]
    expect(analyzeOutput(chunks, prompt).markerAt).toBeNull()
    expect(analyzeOutput([...chunks, {at: 200, data: 'SO'}], prompt).markerAt).toBe(200)
  })
  test('skips the npm spinner and npm warnings', () => {
    const timeline = analyzeOutput(
      [
        ...SPINNER,
        {
          at: 22_690,
          data: '\u001B[1mnpm\u001B[22m \u001B[33mwarn\u001B[39m deprecated uuid@10.0.0: old\r\n',
        },
        {at: 26_350, data: '\r\n\u001B[33m╭────╮\u001B[39m\r\n│ telemetry │\r\n'},
        {at: 26_360, data: ' › Warning: No valid authentication credentials found.\r\n'},
        {at: 26_370, data: '⠋ Fetching providers...'},
      ],
      MARKER,
    )

    expect(timeline.firstOutputAt).toBe(26_350)
    expect(timeline.markerAt).toBe(26_370)
    expect(timeline.firstScreen).toBe(
      [
        '╭────╮',
        '│ telemetry │',
        ' › Warning: No valid authentication credentials found.',
        ' Fetching providers...',
      ].join('\n'),
    )
  })

  test('uses the time of the first visible character, not the start of its chunk', () => {
    const timeline = analyzeOutput(
      [
        {at: 10, data: '   '},
        {at: 20, data: 'hello\n'},
      ],
      MARKER,
    )
    expect(timeline.firstOutputAt).toBe(20)
    expect(timeline.markerAt).toBeNull()
  })

  test('times the marker by the chunk the marker text arrived in', () => {
    const timeline = analyzeOutput(
      [
        {at: 5, data: 'Starting\n'},
        {at: 7, data: 'x '},
        {at: 9, data: 'Fetching providers'},
      ],
      MARKER,
    )
    expect(timeline.firstOutputAt).toBe(5)
    expect(timeline.markerAt).toBe(9)
  })

  test("skips npm's banner before it runs the package", () => {
    const timeline = analyzeOutput(
      [
        {at: 1, data: '\r\n> npx\r\n> "create-sanity"\r\n\r\n'},
        {at: 2, data: 'Welcome\r\nFetching providers'},
      ],
      MARKER,
    )
    expect(timeline.firstOutputAt).toBe(2)
  })

  test('returns nulls when the CLI never prints', () => {
    expect(analyzeOutput([...SPINNER, {at: 900, data: 'npm error 404\n'}], MARKER)).toEqual({
      firstOutputAt: null,
      firstScreen: '',
      markerAt: null,
    })
  })

  test('treats the marker as first output when nothing precedes it', () => {
    const timeline = analyzeOutput([{at: 3, data: 'Fetching providers'}], MARKER)
    expect(timeline).toEqual({firstOutputAt: 3, firstScreen: 'Fetching providers', markerAt: 3})
  })

  test('ignores output after the marker', () => {
    const timeline = analyzeOutput(
      [
        {at: 1, data: 'Fetching providers\n'},
        {at: 2, data: 'Select a provider\n'},
      ],
      MARKER,
    )
    expect(timeline.firstScreen).toBe('Fetching providers')
  })
})

describe('visibleText', () => {
  test('joins the visible characters', () => {
    expect(visibleText([...SPINNER, {at: 1, data: '\u001B[31mnpm error\u001B[39m 404\r\n'}])).toBe(
      'npm error 404\n',
    )
  })
})

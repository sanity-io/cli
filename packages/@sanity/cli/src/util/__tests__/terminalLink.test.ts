import {afterEach, describe, expect, test} from 'vitest'

import {hyperlink} from '../terminalLink.js'

const originalIsTTY = process.stdout.isTTY

afterEach(() => {
  process.stdout.isTTY = originalIsTTY
})

describe('hyperlink', () => {
  test('wraps text in an OSC 8 hyperlink when stdout is a TTY', () => {
    process.stdout.isTTY = true
    const result = hyperlink('claim it', 'https://example.com/claim')
    expect(result).toContain('\u001B]8;;https://example.com/claim\u0007')
    expect(result).toContain('claim it')
    expect(result.endsWith('\u001B]8;;\u0007')).toBe(true)
  })

  test('returns bare text with no escape bytes when stdout is piped', () => {
    process.stdout.isTTY = false
    expect(hyperlink('claim it', 'https://example.com/claim')).toBe('claim it')
  })
})

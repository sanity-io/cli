import {afterEach, describe, expect, test} from 'vitest'

import {renderNewCommandSplash} from '../newCommandSplash.js'

/* eslint-disable no-control-regex */
const stripAnsi = (line: string) =>
  line.replaceAll(/\u001B\]8;;[^\u0007]*\u0007/g, '').replaceAll(/\u001B\[[0-9;]*m/g, '')
/* eslint-enable no-control-regex */

const originalColumns = process.stdout.columns

afterEach(() => {
  process.stdout.columns = originalColumns
})

function render() {
  const lines: string[] = []
  renderNewCommandSplash((message = '') => lines.push(message))
  return lines.map((line) => stripAnsi(line))
}

describe('renderNewCommandSplash', () => {
  test('decides hyperlink support at render time, not module load', () => {
    // OSC 8 emission must track stdout's state when the splash renders — a frozen module-load
    // decision would bake in whatever isTTY was during import.
    const originalIsTTY = process.stdout.isTTY
    try {
      process.stdout.isTTY = true
      process.stdout.columns = 0
      const raw: string[] = []
      renderNewCommandSplash((message = '') => raw.push(message))
      expect(raw.join('\n')).toContain('\u001B]8;;')
    } finally {
      process.stdout.isTTY = originalIsTTY
    }
  })

  test('renders links beside the art when width is unknown (pipes, agents)', () => {
    process.stdout.columns = 0
    const lines = render()
    expect(lines[0]).toBe('')
    expect(lines.at(-1)).toBe('')
    expect(lines.some((line) => line.includes('@@@') && line.includes('https://sanity.new'))).toBe(
      true,
    )
    expect(lines.some((line) => line.includes('https://sanity.io/learn'))).toBe(true)
  })

  test('renders links below the art when the longest link would not fit beside it', () => {
    // 66-69 columns: wider than the old +20 fudge, narrower than column + longest link (24).
    process.stdout.columns = 68
    const lines = render()
    expect(lines.some((line) => line.includes('@@@') && line.includes('https://'))).toBe(false)
    expect(lines.filter((line) => line.startsWith('   https://'))).toHaveLength(2)
  })

  test('renders links below the art on narrow terminals', () => {
    process.stdout.columns = 40
    const lines = render()
    const linkLines = lines.filter((line) => line.startsWith('   https://'))
    expect(linkLines).toEqual(['   https://sanity.new', '   https://sanity.io/learn'])
    expect(lines.some((line) => line.includes('@@@') && line.includes('https://'))).toBe(false)
  })
})

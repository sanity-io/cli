/**
 * Terminal output recorded from a pty, with the time each chunk arrived.
 * `at` is milliseconds since the command was spawned.
 */
export interface OutputChunk {
  at: number
  data: string
}

export interface OutputTimeline {
  /** Time of the first character the CLI printed itself, or `null` if it never did */
  firstOutputAt: number | null
  /** Visible text from the CLI's first output up to and including the marker line */
  firstScreen: string
  /** Time the guard marker first appeared, or `null` if it never did */
  markerAt: number | null
}

// CSI (`ESC [ … final`), OSC (`ESC ] … BEL|ST`) and two-byte escapes such as
// `ESC 7` (save cursor)

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[0-~]/y

// npm draws its install spinner with braille characters
const SPINNER_PATTERN = /[⠀-⣿]/

// Lines npm itself prints: `npm warn deprecated uuid@10.0.0: …` while installing,
// and `> npx` / `> "create-sanity"` just before `npm create` runs the package
const NPM_LINE_PATTERN = /^(?:npm (?:warn|notice|error|info|http|verbose|WARN|ERR!)\b|> )/

/**
 * A character of visible output, with the time it arrived.
 */
interface VisibleChar {
  at: number
  char: string
}

/**
 * Strips escape sequences, carriage returns and spinner glyphs from the recorded
 * chunks while keeping track of when each remaining character arrived.
 *
 * Escape sequences are matched on the concatenated stream so a sequence split
 * across two chunks is still removed.
 */
export function toVisibleChars(chunks: readonly OutputChunk[]): VisibleChar[] {
  let raw = ''
  const arrivedAt: number[] = []
  for (const chunk of chunks) {
    raw += chunk.data
    for (let i = 0; i < chunk.data.length; i++) arrivedAt.push(chunk.at)
  }

  const visible: VisibleChar[] = []
  let index = 0
  while (index < raw.length) {
    ANSI_PATTERN.lastIndex = index
    const escape = ANSI_PATTERN.exec(raw)
    if (escape) {
      index += escape[0].length
      continue
    }
    const char = raw[index]
    if (char !== '\r' && !SPINNER_PATTERN.test(char)) {
      visible.push({at: arrivedAt[index], char})
    }
    index++
  }
  return visible
}

/** The recorded output as the user would have read it */
export function visibleText(chunks: readonly OutputChunk[]): string {
  return toVisibleChars(chunks)
    .map((c) => c.char)
    .join('')
}

/**
 * Finds when the CLI printed its first output and when the guard marker appeared.
 *
 * Output from npm (its spinner and `npm warn …` lines) is not the CLI's output,
 * so it is skipped: a user sees it, but it does not mean the CLI has started.
 */
export function analyzeOutput(chunks: readonly OutputChunk[], marker: RegExp): OutputTimeline {
  const chars = toVisibleChars(chunks)

  const lines: VisibleChar[][] = [[]]
  for (const char of chars) {
    if (char.char === '\n') {
      lines.push([])
    } else {
      lines.at(-1)!.push(char)
    }
  }

  let firstOutputAt: number | null = null
  let markerAt: number | null = null
  const screen: string[] = []

  for (const line of lines) {
    const text = line.map((c) => c.char).join('')
    const trimmed = text.trim()
    if (firstOutputAt === null) {
      if (trimmed === '' || NPM_LINE_PATTERN.test(trimmed)) continue
      const firstVisible = line.find((c) => c.char.trim() !== '')!
      firstOutputAt = firstVisible.at
    }

    screen.push(text.trimEnd())
    if (marker.test(screen.join('\n'))) break
  }

  const match = marker.exec(chars.map((c) => c.char).join(''))
  if (match?.[0]) markerAt = chars[match.index + match[0].length - 1].at

  return {firstOutputAt, firstScreen: screen.join('\n').trim(), markerAt}
}

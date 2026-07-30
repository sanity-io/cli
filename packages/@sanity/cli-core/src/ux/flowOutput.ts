import {styleText} from 'node:util'

import wrapAnsi from 'wrap-ansi'

import {isInteractive} from '../util/isInteractive.js'
import {spinner, type SpinnerInstance} from './spinner.js'

type LogFn = (message?: string) => void

const SPINNER_FRAMES = ['◐ ', '◓ ', '◑ ', '◒ ']
const RAIL_PREFIX_WIDTH = 3
const MAX_RENDERED_LINE_WIDTH = 79

function rail(glyph: string): string {
  return styleText('gray', glyph)
}

function wrapText(text: string): string[] {
  const terminalWidth =
    process.stdout.isTTY && Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
      ? process.stdout.columns
      : MAX_RENDERED_LINE_WIDTH + 1
  const renderedWidth = Math.min(terminalWidth - 1, MAX_RENDERED_LINE_WIDTH)
  const width = Math.max(renderedWidth - RAIL_PREFIX_WIDTH, 1)
  return wrapAnsi(text, width, {hard: false, wordWrap: true}).split('\n')
}

function writeRailed(log: LogFn, glyph: string, text: string): void {
  for (const [index, line] of wrapText(text).entries()) {
    const marker =
      index === 0 && glyph === '◆' ? styleText('green', glyph) : rail(index === 0 ? glyph : '│')
    log(`${marker}  ${line}`)
  }
}

function writeStderr(message = ''): void {
  process.stderr.write(`${message}\n`)
}

function isTerminalControl(character: string): boolean {
  const codePoint = character.codePointAt(0)
  return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
}

function isSafeTerminalLink(url: string): boolean {
  if ([...url].some((character) => isTerminalControl(character))) return false
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function encodeTerminalControls(value: string): string {
  return [...value]
    .map((character) => (isTerminalControl(character) ? encodeURIComponent(character) : character))
    .join('')
}

function terminalLink(url: string): string {
  const sanitizedUrl = encodeTerminalControls(url)
  if (!process.stdout.isTTY || sanitizedUrl !== url || !isSafeTerminalLink(url)) {
    return sanitizedUrl
  }
  return `\u001B]8;;${url}\u0007${styleText(['cyan', 'underline'], url)}\u001B]8;;\u0007`
}

export interface Flow {
  /** An indented, copyable command belonging to the preceding action. */
  command(command: string): void
  /** `│` — a blank rail line separating steps. */
  gap(): void
  /** `◆` — an outcome the user should act on or remember. */
  highlight(text: string): void
  /** `┌` — opening line of the story. */
  intro(text: string): void
  /** `│  <text>` — a continuation line belonging to the previous step. */
  line(text: string): void
  /** A copy-safe URL. Long URLs are never hard-wrapped. */
  link(url: string, options?: {label?: string; outro?: boolean}): void
  /** `●` — a step happening behind the scenes, or a tip. */
  note(text: string): void
  /** `└` — closing line of the story. */
  outro(text: string): void
  /** `◇` — a completed step or produced value. */
  result(text: string): void
  /**
   * An in-flight step. Resolve it with `succeed(text)` (persists as a `◇` line) or `fail(text)`;
   * renders on stderr so machine-readable stdout is never corrupted.
   */
  spin(text: string): {fail(text: string): void; succeed(text: string): void}
}

/** Create a {@link Flow} that writes rail lines through `log`. */
export function createFlow(log: LogFn): Flow {
  return {
    command(command: string) {
      log(`${rail('│')}     ${styleText('cyan', `$ ${command}`)}`)
    },
    gap() {
      log(rail('│'))
    },
    highlight(text: string) {
      writeRailed(log, '◆', text)
    },
    intro(text: string) {
      writeRailed(log, '┌', text)
    },
    line(text: string) {
      writeRailed(log, '│', text)
    },
    link(url: string, options = {}) {
      const label = options.label ? `${options.label} ` : ''
      log(`${rail(options.outro ? '└' : '│')}  ${label}${terminalLink(url)}`)
    },
    note(text: string) {
      writeRailed(log, '●', text)
    },
    outro(text: string) {
      writeRailed(log, '└', text)
    },
    result(text: string) {
      writeRailed(log, '◇', text)
    },
    spin(text: string) {
      if (!isInteractive() || !process.stderr.isTTY || !process.stderr.columns) {
        writeRailed(writeStderr, '●', text)
        return {
          fail: (failText: string) => writeStderr(`${styleText('red', '✖')}  ${failText}`),
          succeed: (successText: string) => writeStderr(`${rail('◇')}  ${successText}`),
        }
      }

      const spin: SpinnerInstance = spinner({
        spinner: {frames: SPINNER_FRAMES, interval: 120},
        text,
      }).start()
      return {
        fail(failText: string) {
          spin.stopAndPersist({symbol: `${styleText('red', '✖')} `, text: failText})
        },
        succeed(successText: string) {
          spin.stopAndPersist({symbol: `${rail('◇')} `, text: successText})
        },
      }
    },
  }
}

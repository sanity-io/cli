import {styleText} from 'node:util'

import {isInteractive} from '../util/isInteractive.js'
import {spinner, type SpinnerInstance} from './spinner.js'

type LogFn = (message?: string) => void

const SPINNER_FRAMES = ['◐ ', '◓ ', '◑ ', '◒ ']

function rail(glyph: string): string {
  return styleText('gray', glyph)
}

export interface Flow {
  /** `│` — a blank rail line separating steps. */
  gap(): void
  /** `◆` — an outcome the user should act on or remember. */
  highlight(text: string): void
  /** `┌` — opening line of the story. */
  intro(text: string): void
  /** `│  <text>` — a continuation line belonging to the previous step. */
  line(text: string): void
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
    gap() {
      log(rail('│'))
    },
    highlight(text: string) {
      log(`${styleText('green', '◆')}  ${text}`)
    },
    intro(text: string) {
      log(`${rail('┌')}  ${text}`)
    },
    line(text: string) {
      log(`${rail('│')}  ${text}`)
    },
    note(text: string) {
      log(`${rail('●')}  ${text}`)
    },
    outro(text: string) {
      log(`${rail('└')}  ${text}`)
    },
    result(text: string) {
      log(`${rail('◇')}  ${text}`)
    },
    spin(text: string) {
      // No human, or stderr can't render cleanly (piped, or a zero-width pty that sends ora into
      // a re-render hot loop): print a plain line instead of animating.
      if (!isInteractive() || !process.stderr.isTTY || !process.stderr.columns) {
        this.note(text)
        return {
          fail: (failText: string) => log(`${styleText('red', '✖')}  ${failText}`),
          succeed: (successText: string) => log(`${rail('◇')}  ${successText}`),
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

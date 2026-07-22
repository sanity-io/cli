import {styleText} from 'node:util'

import {spinner, type SpinnerInstance} from '@sanity/cli-core/ux'

/** Sink for flow lines — matches the `Output['log']` shape commands already carry. */
type LogFn = (message?: string) => void

/**
 * Orbiting-moon frames so the in-flight glyph reads as part of the rail's `◇`/`◆` family. The
 * trailing space matches the rail's two-space gutter (ora renders `<frame> <text>`).
 */
const SPINNER_FRAMES = ['◐ ', '◓ ', '◑ ', '◒ ']

function rail(glyph: string): string {
  return styleText('gray', glyph)
}

/**
 * A clack-style narrated flow (the visual language of `neon-new`, `create-astro`, etc.): a dimmed
 * left rail (`┌ │ └`) with per-step glyphs — `●` for things happening behind the scenes, `◇` for
 * produced values, `◆` for outcomes worth remembering — so a multi-step command reads as one
 * connected story, equally in a TTY and as raw text in an agent's message stream.
 *
 * Emitters never insert blank rail lines on their own; callers compose spacing with `gap()`.
 */
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
      // Without a TTY (CI, agents reading the stream) an animated spinner is noise on stderr that
      // interleaves badly with the stdout rail — degrade to plain rail lines instead. Same for a
      // zero-width pty (some CI/agent harnesses): ora's line-wrapping re-renders in a hot loop
      // there, starving the event loop.
      if (!process.stderr.isTTY || !process.stderr.columns) {
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

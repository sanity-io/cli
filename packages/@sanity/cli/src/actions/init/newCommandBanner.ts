import {styleText} from 'node:util'

import {boxen, logSymbols} from '@sanity/cli-core/ux'

import {hyperlink as link} from '../../util/terminalLink.js'
import {type InitContext} from './types.js'

const SANITY_NEW_URL = 'https://sanity.new'

/** 24-bit foreground gradient across `text`, from `from` to `to` RGB. Skipped under NO_COLOR. */
function gradient(text: string, from: [number, number, number], to: [number, number, number]) {
  if (process.env.NO_COLOR) return text
  const chars = [...text]
  const steps = Math.max(chars.length - 1, 1)
  return `${chars
    .map((char, i) => {
      const mix = (a: number, b: number) => Math.round(a + ((b - a) * i) / steps)
      return `\u001B[1;38;2;${mix(from[0], to[0])};${mix(from[1], to[1])};${mix(from[2], to[2])}m${char}`
    })
    .join('')}\u001B[0m`
}

/**
 * Variant 1 — "whisper": a single info line ahead of the login flow. The quiet option: informs
 * without interrupting people who just want to log in.
 */
function whisper(output: InitContext['output']): void {
  output.log(
    `${logSymbols.info} Don't want to log in yet? Cancel (Ctrl+C) and run ${styleText('cyan', 'sanity new')} to create a project you can claim with an account later → ${link(SANITY_NEW_URL, SANITY_NEW_URL)}`,
  )
  output.log('')
}

/**
 * Variant 2 — "signpost": a boxed fork-in-the-road that frames init and new as two equally valid
 * front doors, mirroring how the flows relate.
 */
function signpost(output: InitContext['output']): void {
  output.log(
    boxen(
      `${styleText('bold', 'Two ways to start')}

${styleText('cyan', 'sanity init')}  Log in and set up a Studio ${styleText('dim', "(you're here)")}
${styleText('cyan', 'sanity new')}   No login — mint a project now, claim it within 72 hours

Learn how it works: ${link(SANITY_NEW_URL, SANITY_NEW_URL)}`,
      {
        borderColor: 'cyan',
        borderStyle: 'round',
        padding: 1,
      },
    ),
  )
  output.log('')
}

/**
 * Variant 3 — "marquee": a neon.new-style splash. Loud on purpose — treats the unauthenticated
 * flow as the headline act rather than a footnote.
 */
function marquee(output: InitContext['output']): void {
  output.log('')
  output.log(`  ${gradient('⚡ s a n i t y . n e w', [255, 0, 128], [0, 255, 255])}`)
  output.log(`  ${styleText('dim', '─'.repeat(46))}`)
  output.log(`  Zero login. Instant project. Claim it when you're ready.`)
  output.log(
    `  ${styleText('dim', 'Ctrl+C now, then:')} ${styleText('cyan', 'sanity new')}  ${styleText('dim', '·')}  ${link(SANITY_NEW_URL, SANITY_NEW_URL)}`,
  )
  output.log('')
}

const variants: Record<string, (output: InitContext['output']) => void> = {
  '1': whisper,
  '2': signpost,
  '3': marquee,
}

/**
 * Points people who don't want to (or can't) log in at `sanity new` before the interactive login
 * takes over the terminal.
 *
 * Three visual treatments are selectable via `SANITY_NEW_BANNER=1|2|3` (default `1`) so the team
 * can compare them in situ — e.g. `SANITY_NEW_BANNER=3 sanity init`. Unknown values fall back to
 * the default.
 */
export function renderNewCommandBanner(output: InitContext['output']): void {
  const variant = variants[process.env.SANITY_NEW_BANNER ?? '1'] ?? whisper
  variant(output)
}

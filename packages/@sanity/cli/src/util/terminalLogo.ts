import {isInteractive} from '@sanity/cli-core/util'

import {logoImage} from '../generated/logoImage.js'

/** Terminal rows the logo is scaled to fit. */
const LOGO_ROWS = 3

/** Upper bound on waiting for the terminal to answer, in case it never answers DA1. */
const PROBE_TIMEOUT_MS = 500

/** Max base64 bytes per kitty graphics escape sequence. */
const CHUNK_SIZE = 4096

// Ask, in one round trip: does the terminal support kitty graphics (a 1x1 query
// image), what is its background color (OSC 11), and its primary device
// attributes (DA1). Every terminal answers DA1, and answers it last, so its
// reply marks the end of the response.
const PROBE_QUERY = '\u001B_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\u001B\\\u001B]11;?\u001B\\\u001B[c'
/* eslint-disable no-control-regex -- matching the terminal's escape sequence replies */
const KITTY_OK_RE = /\u001B_Gi=31;OK/
const BACKGROUND_RE = /\u001B\]11;rgb:([\da-f]+)\/([\da-f]+)\/([\da-f]+)/i
const DA1_RE = /\u001B\[\?[\d;]*c/
/* eslint-enable no-control-regex */

/**
 * Returns an escape sequence that draws the Sanity logo, or `undefined` when the
 * terminal can't display it. Draws only on interactive terminals that answer the
 * kitty graphics query.
 *
 * @internal
 */
export async function getTerminalLogo(): Promise<string | undefined> {
  if (!isInteractive() || !process.stdout.isTTY) return undefined
  // tmux and screen swallow kitty graphics unless they are forwarded with
  // passthrough, and Terminal.app prints the query instead of ignoring it.
  if (process.env.TMUX || process.env.STY || process.env.TERM_PROGRAM === 'Apple_Terminal') {
    return undefined
  }

  return terminalLogoForReply(await probeTerminal())
}

/**
 * Builds the logo escape sequence from the terminal's reply to the probe.
 *
 * @internal
 */
export function terminalLogoForReply(reply: string): string | undefined {
  if (!KITTY_OK_RE.test(reply)) return undefined

  const image = isLightBackground(reply) ? logoImage.onLightBackground : logoImage.onDarkBackground

  // Reserve the rows first, so placing the image never scrolls the screen, then
  // draw it with the cursor held in place (C=1) and move to its last row. Logged
  // with a trailing newline, it takes up the space of LOGO_ROWS lines of text.
  let sequence = `${'\n'.repeat(LOGO_ROWS - 1)}\u001B[${LOGO_ROWS - 1}A`
  for (let offset = 0; offset < image.length; offset += CHUNK_SIZE) {
    const more = offset + CHUNK_SIZE < image.length ? 1 : 0
    const keys = offset === 0 ? `a=T,f=100,r=${LOGO_ROWS},C=1,q=2,m=${more}` : `m=${more}`
    sequence += `\u001B_G${keys};${image.slice(offset, offset + CHUNK_SIZE)}\u001B\\`
  }
  return `${sequence}\u001B[${LOGO_ROWS - 1}B`
}

function isLightBackground(reply: string): boolean {
  const match = BACKGROUND_RE.exec(reply)
  if (!match) return false

  // Each channel is 1-4 hex digits, scaled to that many digits' range.
  const [r, g, b] = match.slice(1).map((hex) => Number.parseInt(hex, 16) / (16 ** hex.length - 1))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
}

function probeTerminal(): Promise<string> {
  const {stdin, stdout} = process
  const wasRaw = stdin.isRaw

  return new Promise((resolve) => {
    let reply = ''
    const finish = () => {
      clearTimeout(timeout)
      stdin.off('data', onData)
      stdin.setRawMode(wasRaw)
      stdin.pause()
      resolve(reply)
    }
    const onData = (data: Buffer) => {
      reply += data.toString('latin1')
      if (DA1_RE.test(reply)) finish()
    }
    const timeout = setTimeout(finish, PROBE_TIMEOUT_MS)

    stdin.setRawMode(true)
    stdin.on('data', onData)
    stdin.resume()
    stdout.write(PROBE_QUERY)
  })
}

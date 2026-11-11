import {emitKeypressEvents} from 'node:readline'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import open from 'open'

export function bindDevShortcuts({
  output,
  quit,
  url,
}: {
  output: Output
  quit: () => void
  url: string
}): () => Promise<void> {
  const {stdin} = process
  if (!stdin.isTTY) return async () => {}

  const onKeypress = (_: string | undefined, key: {ctrl?: boolean; name?: string} = {}) => {
    const isWindows = process.platform === 'win32'

    if (key.ctrl && key.name === 'c' && !isWindows) {
      // Raw mode stops the terminal from signalling the process group, so the parent (pnpm) needs it too.
      process.kill(0, 'SIGINT')
    } else if (key.name === 'q' || (key.ctrl && (key.name === 'c' || key.name === 'd'))) {
      quit()
    } else if (key.ctrl && key.name === 'z' && !isWindows) {
      stdin.setRawMode(false)
      process.once('SIGCONT', () => stdin.setRawMode(true))
      process.kill(0, 'SIGTSTP')
    } else if (key.name === 'o') {
      open(url).catch((err) => output.warn(`Could not open ${url}: ${err.message}`))
    }
  }

  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.on('keypress', onKeypress)
  output.log(
    `  ${styleText('dim', 'press')} o ${styleText('dim', 'to open ·')} q ${styleText('dim', 'to quit')}\n`,
  )

  return async () => {
    stdin.off('keypress', onKeypress)
    stdin.setRawMode(false)
    stdin.pause()
  }
}

import {emitKeypressEvents} from 'node:readline'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import open from 'open'

const SHORTCUTS = [
  ['o', 'open the app in your browser'],
  ['h', 'show this help'],
  ['q', 'quit'],
] as const

export function bindDevShortcuts({
  output,
  url,
}: {
  output: Output
  url: string
}): () => Promise<void> {
  const {stdin} = process
  if (!stdin.isTTY) return async () => {}

  const onKeypress = (_: string | undefined, key: {ctrl?: boolean; name?: string} = {}) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.emit('SIGINT', 'SIGINT')
    } else if (key.name === 'o') {
      open(url).catch((err) => output.warn(`Could not open ${url}: ${err.message}`))
    } else if (key.name === 'h') {
      output.log(
        ['  Shortcuts', ...SHORTCUTS.map(([k, action]) => `    ${k}  ${action}`), ''].join('\n'),
      )
    }
  }

  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.on('keypress', onKeypress)
  output.log(
    `  ${styleText('dim', 'press')} o ${styleText('dim', 'to open ·')} h ${styleText('dim', 'for help ·')} q ${styleText('dim', 'to quit')}\n`,
  )

  return async () => {
    stdin.off('keypress', onKeypress)
    stdin.setRawMode(false)
    stdin.pause()
  }
}

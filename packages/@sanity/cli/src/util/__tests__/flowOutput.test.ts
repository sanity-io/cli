import {afterEach, describe, expect, test} from 'vitest'

import {createFlow} from '../flowOutput.js'

/* eslint-disable no-control-regex */
const stripAnsi = (line: string) => line.replaceAll(/\u001B\[[0-9;]*m/g, '')
/* eslint-enable no-control-regex */

const originalStderrIsTTY = process.stderr.isTTY

afterEach(() => {
  process.stderr.isTTY = originalStderrIsTTY
})

function collect() {
  const lines: string[] = []
  const flow = createFlow((message = '') => lines.push(message))
  return {flow, plain: () => lines.map((line) => stripAnsi(line))}
}

describe('createFlow', () => {
  test('renders the rail glyphs for each emitter', () => {
    const {flow, plain} = collect()
    flow.intro('hello')
    flow.note('working')
    flow.result('done thing')
    flow.line('detail')
    flow.highlight('remember this')
    flow.gap()
    flow.outro('bye')
    expect(plain()).toEqual([
      '┌  hello',
      '●  working',
      '◇  done thing',
      '│  detail',
      '◆  remember this',
      '│',
      '└  bye',
    ])
  })

  test('spin degrades to plain rail lines without a TTY and persists success as a result line', () => {
    process.stderr.isTTY = false
    const {flow, plain} = collect()
    const spin = flow.spin('minting')
    spin.succeed('minted')
    expect(plain()).toEqual(['●  minting', '◇  minted'])
  })

  test('spin failure persists a failure line without a TTY', () => {
    process.stderr.isTTY = false
    const {flow, plain} = collect()
    const spin = flow.spin('minting')
    spin.fail('mint failed')
    expect(plain()).toEqual(['●  minting', '✖  mint failed'])
  })
})

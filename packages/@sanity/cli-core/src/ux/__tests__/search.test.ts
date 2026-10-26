import {PassThrough} from 'node:stream'
import {setImmediate as nextMacrotask} from 'node:timers/promises'

import {expect, onTestFinished, test, vi} from 'vitest'

import {search} from '../prompts.js'

vi.mock('../../util/isInteractive.js', () => ({isInteractive: () => true}))

function renderSearch(config: Parameters<typeof search>[0]) {
  const input = new PassThrough()
  const output = new PassThrough()
  let screen = ''
  output.on('data', (chunk: Buffer) => {
    screen += chunk.toString()
  })

  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  const answer = search(config, {input, output, signal: controller.signal})
  answer.catch(() => {})

  return {answer, input, screen: () => screen}
}

test('search resolves the match for the typed term when Enter arrives before its results', async () => {
  const filtered = Promise.withResolvers<string[]>()
  const {answer, input, screen} = renderSearch({
    message: 'Pick',
    source: (term) => (term ? filtered.promise : ['alpha', 'beta']),
  })
  let submitted: unknown
  void answer.then((value) => {
    submitted = value
  })
  await vi.waitFor(() => expect(screen()).toContain('❯ alpha'))

  input.write('beta\r')
  filtered.resolve(['beta'])
  await vi.waitFor(() => expect(submitted !== undefined || screen().includes('❯ beta')).toBe(true))
  await nextMacrotask()
  expect(submitted, 'Enter before the results submitted the previous highlight').toBeUndefined()
  input.write('\r')

  await expect(answer).resolves.toBe('beta')
})

test('search highlights the default choice', async () => {
  const {screen} = renderSearch({default: 'beta', message: 'Pick', source: () => ['alpha', 'beta']})

  await vi.waitFor(() => expect(screen()).toContain('❯ beta'))
})

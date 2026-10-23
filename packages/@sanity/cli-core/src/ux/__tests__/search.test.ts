import {PassThrough} from 'node:stream'
import {setImmediate as nextMacrotask} from 'node:timers/promises'

import {expect, test, vi} from 'vitest'

import {search} from '../prompts.js'

vi.mock('../../util/isInteractive.js', () => ({isInteractive: () => true}))

test('search resolves the match for the typed term when Enter arrives before its results', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let screen = ''
  output.on('data', (chunk: Buffer) => {
    screen += chunk.toString()
  })

  const filtered = Promise.withResolvers<string[]>()
  const answer = search(
    {message: 'Pick', source: (term) => (term ? filtered.promise : ['alpha', 'beta'])},
    {input, output},
  )
  let submitted: string | undefined
  void answer.then(
    (value) => {
      submitted = value
    },
    () => {},
  )
  await vi.waitFor(() => expect(screen).toContain('❯ alpha'))

  input.write('beta\r')
  filtered.resolve(['beta'])
  await vi.waitFor(() => {
    if (submitted === undefined) expect(screen).toContain('❯ beta')
  })
  await nextMacrotask()
  expect(submitted, 'Enter before the results submitted the previous highlight').toBeUndefined()
  input.write('\r')

  await expect(answer).resolves.toBe('beta')
})

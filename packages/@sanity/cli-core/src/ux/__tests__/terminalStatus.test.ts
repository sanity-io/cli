import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {runWithCliExecutionContext} from '../../executionContext.js'
import {createTerminalStatus, finishTerminalStatus, withPromptStatus} from '../terminalStatus.js'

// Encode a readable stand-in so assertions cover the reports actually written,
// including suppression of repeated spinner frames.
vi.mock('osc-status', () => ({
  encodeStatus: (state: string, fields: Record<string, unknown>) =>
    JSON.stringify({state, ...fields}),
}))

const write = vi.fn((_sequence: string | Uint8Array) => true)
const reports = () =>
  write.mock.calls.map(
    ([sequence]) =>
      JSON.parse(sequence.toString()) as {
        app: string
        kind?: string
        message?: string
        state: string
      },
  )

const originalTty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')

describe('terminal status', () => {
  beforeEach(() => {
    vi.stubEnv('CI', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    Object.defineProperty(process.stderr, 'isTTY', {configurable: true, value: true})
    vi.spyOn(process.stderr, 'write').mockImplementation(write)
    finishTerminalStatus('idle')
    vi.clearAllMocks()
  })

  afterEach(() => {
    finishTerminalStatus('idle')
    if (originalTty) Object.defineProperty(process.stderr, 'isTTY', originalTty)
    else Reflect.deleteProperty(process.stderr, 'isTTY')
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test('restores the latest spinner text after a prompt, without duplicate frame reports', async () => {
    const spin = createTerminalStatus()
    spin.update({message: 'Building', state: 'working'})
    spin.update({message: 'Building', state: 'working'})
    expect(reports()).toEqual([{app: 'sanity', message: 'Building', state: 'working'}])

    const answer = Promise.withResolvers<string>()
    const promise = withPromptStatus('permission', 'Deploy?', () => answer.promise)
    spin.update({message: 'Uploading', state: 'working'})
    expect(reports().at(-1)).toEqual({
      app: 'sanity',
      kind: 'permission',
      message: 'Deploy?',
      state: 'blocked',
    })
    expect(reports()).toHaveLength(2)

    answer.resolve('yes')
    await expect(promise).resolves.toBe('yes')
    expect(reports().at(-1)).toEqual({app: 'sanity', message: 'Uploading', state: 'working'})
    spin.stop()
    expect(reports().at(-1)).toEqual({app: 'sanity', state: 'working'})
    expect(reports().some(({state}) => state === 'done')).toBe(false)
  })

  test('preserves the cancellable promise and restores status when it rejects', async () => {
    const answer = Promise.withResolvers<string>()
    const original = Object.assign(answer.promise, {cancel: vi.fn()})
    const result = withPromptStatus('question', 'Choose', () => original)
    expect(result).toBe(original)
    result.cancel()
    expect(original.cancel).toHaveBeenCalledOnce()
    answer.reject(new Error('cancelled'))
    await expect(result).rejects.toThrow('cancelled')
    expect(reports().at(-1)).toEqual({app: 'sanity', state: 'working'})
  })

  test('does not report a prompt that throws synchronously', () => {
    expect(() =>
      withPromptStatus('auth', 'Password', () => {
        throw new Error('failed')
      }),
    ).toThrow('failed')
    expect(write).not.toHaveBeenCalled()
  })

  test('strips styling and controls and bounds UTF-8 messages', () => {
    const status = createTerminalStatus()
    status.update({message: '\u001B[31mRed\u001B[0m\n\t\u0085text', state: 'working'})
    expect(reports().at(-1)).toEqual({app: 'sanity', message: 'Red   text', state: 'working'})
    status.update({message: '😀'.repeat(1000), state: 'working'})
    const message = reports().at(-1)?.message ?? ''
    expect(Buffer.byteLength(message)).toBe(2048)
    expect(message).toBe('😀'.repeat(512))
  })

  describe.each(['context', 'pipe', 'dumb', 'CI'])('suppression under %s', (mode) => {
    test.each(['update', 'stop', 'finish'])(
      'ignores %s without changing active status',
      (operation) => {
        const spin = createTerminalStatus()
        spin.update({message: 'Building', state: 'working'})
        vi.clearAllMocks()
        const invoke = () => {
          if (operation === 'update') {
            spin.update({message: 'Changed', state: 'working'})
            createTerminalStatus().update({state: 'blocked'})
          } else if (operation === 'stop') spin.stop()
          else finishTerminalStatus('error')
        }
        try {
          if (mode === 'pipe')
            Object.defineProperty(process.stderr, 'isTTY', {configurable: true, value: false})
          if (mode === 'dumb') vi.stubEnv('TERM', 'dumb')
          if (mode === 'CI') vi.stubEnv('CI', '')
          if (mode === 'context') runWithCliExecutionContext({}, invoke)
          else invoke()
          expect(write).not.toHaveBeenCalled()
        } finally {
          Object.defineProperty(process.stderr, 'isTTY', {configurable: true, value: true})
          vi.stubEnv('TERM', 'xterm-256color')
          vi.stubEnv('CI', undefined)
        }

        const temporary = createTerminalStatus()
        temporary.update({message: 'Temporary', state: 'working'})
        temporary.stop()
        expect(reports()).toEqual([
          {app: 'sanity', message: 'Temporary', state: 'working'},
          {app: 'sanity', message: 'Building', state: 'working'},
        ])
      },
    )
  })

  test.each(['done', 'error', 'idle'] as const)(
    'finishes with %s and clears all transient statuses',
    (state) => {
      const spin = createTerminalStatus()
      spin.update({message: 'Building', state: 'working'})
      const prompt = createTerminalStatus()
      prompt.update({kind: 'permission', message: 'Deploy?', state: 'blocked'})
      finishTerminalStatus(state)
      expect(reports().at(-1)).toEqual({app: 'sanity', state})
      vi.clearAllMocks()
      prompt.stop()
      spin.stop()
      expect(write).not.toHaveBeenCalled()
    },
  )
})

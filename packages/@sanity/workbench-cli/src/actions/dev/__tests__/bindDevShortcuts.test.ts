import {PassThrough} from 'node:stream'

import open from 'open'
import {afterEach, beforeEach, describe, expect, onTestFinished, test, vi} from 'vitest'

import {bindDevShortcuts} from '../bindDevShortcuts.js'
import {createMockOutput} from './devTestHelpers.js'

vi.mock('open', () => ({default: vi.fn().mockResolvedValue(undefined)}))

const url = 'http://localhost:3333/applications/test-app'
const realStdin = process.stdin

function fakeStdin({isTTY}: {isTTY: boolean}) {
  const stdin = Object.assign(new PassThrough(), {isTTY, setRawMode: vi.fn()})
  Object.defineProperty(process, 'stdin', {configurable: true, value: stdin})

  return stdin
}

function press(stdin: PassThrough, key: string) {
  stdin.write(key)

  return new Promise((resolve) => setImmediate(resolve))
}

describe('bindDevShortcuts', () => {
  let onSigint: ReturnType<typeof vi.fn<(signal: NodeJS.Signals) => void>>

  beforeEach(() => {
    onSigint = vi.fn<(signal: NodeJS.Signals) => void>()
    process.on('SIGINT', onSigint)
  })

  afterEach(() => {
    process.off('SIGINT', onSigint)
    Object.defineProperty(process, 'stdin', {configurable: true, value: realStdin})
    vi.clearAllMocks()
  })

  test('prints the shortcut hint and opens the app on o', async () => {
    const stdin = fakeStdin({isTTY: true})
    const output = createMockOutput()

    const unbind = bindDevShortcuts({output, url})
    await press(stdin, 'o')
    await unbind()

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('to quit'))
    expect(open).toHaveBeenCalledWith(url)
  })

  test('warns when the browser cannot be opened', async () => {
    vi.mocked(open).mockRejectedValueOnce(new Error('no browser'))
    const stdin = fakeStdin({isTTY: true})
    const output = createMockOutput()

    const unbind = bindDevShortcuts({output, url})
    await press(stdin, 'o')
    await unbind()

    expect(output.warn).toHaveBeenCalledWith(`Could not open ${url}: no browser`)
  })

  test('lists the shortcuts on h', async () => {
    const stdin = fakeStdin({isTTY: true})
    const output = createMockOutput()

    const unbind = bindDevShortcuts({output, url})
    await press(stdin, 'h')
    await unbind()

    expect(output.log).toHaveBeenLastCalledWith(expect.stringContaining('o  open the app'))
  })

  test.each([
    ['q', 'q'],
    ['Ctrl+C', '\u0003'],
    ['Ctrl+D', '\u0004'],
  ])('quits through the SIGINT teardown on %s', async (_, key) => {
    const stdin = fakeStdin({isTTY: true})

    const unbind = bindDevShortcuts({output: createMockOutput(), url})
    await press(stdin, key)
    await unbind()

    expect(onSigint).toHaveBeenCalledWith('SIGINT')
  })

  test('suspends with the terminal restored on Ctrl+Z and resumes raw mode on SIGCONT', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const stdin = fakeStdin({isTTY: true})
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      expect(stdin.setRawMode).toHaveBeenLastCalledWith(false)
      return true
    })
    onTestFinished(() => vi.restoreAllMocks())

    const unbind = bindDevShortcuts({output: createMockOutput(), url})
    await press(stdin, '\u001A')

    expect(killSpy).toHaveBeenCalledWith(0, 'SIGTSTP')

    process.emit('SIGCONT', 'SIGCONT')
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(true)
    await unbind()
  })

  test('ignores Ctrl+Z on Windows, where SIGTSTP cannot suspend', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
    onTestFinished(() => vi.restoreAllMocks())
    const stdin = fakeStdin({isTTY: true})

    const unbind = bindDevShortcuts({output: createMockOutput(), url})
    await press(stdin, '\u001A')

    expect(killSpy).not.toHaveBeenCalled()
    expect(stdin.setRawMode).toHaveBeenLastCalledWith(true)
    await unbind()
  })

  test('restores the terminal and stops listening on unbind', async () => {
    const stdin = fakeStdin({isTTY: true})

    const unbind = bindDevShortcuts({output: createMockOutput(), url})
    await unbind()
    await press(stdin, 'q')

    expect(stdin.setRawMode).toHaveBeenLastCalledWith(false)
    expect(onSigint).not.toHaveBeenCalled()
  })

  test('binds nothing when stdin is not a terminal', () => {
    const stdin = fakeStdin({isTTY: false})
    const output = createMockOutput()

    bindDevShortcuts({output, url})

    expect(stdin.setRawMode).not.toHaveBeenCalled()
    expect(output.log).not.toHaveBeenCalled()
  })
})

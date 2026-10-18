import {describe, expect, test, vi} from 'vitest'

import {outputJson} from '../outputJson.js'

describe('outputJson', () => {
  test('uses the JSON writer even when ordinary logs are suppressed', () => {
    const output = {
      error: vi.fn(() => undefined as never),
      log: vi.fn(),
      logJson: vi.fn(),
      warn: vi.fn(),
    }
    outputJson(output, [])
    expect(output.logJson).toHaveBeenCalledExactlyOnceWith([])
    expect(output.log).not.toHaveBeenCalled()
  })

  test('supports existing action callers with a text-only output adapter', () => {
    const output = {error: vi.fn(() => undefined as never), log: vi.fn(), warn: vi.fn()}
    outputJson(output, {value: 1})
    expect(output.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({value: 1}, null, 2))
  })
})

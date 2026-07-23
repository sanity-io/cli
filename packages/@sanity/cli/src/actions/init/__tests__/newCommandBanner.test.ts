import {afterEach, describe, expect, test, vi} from 'vitest'

import {renderNewCommandBanner} from '../newCommandBanner.js'

function render(): string {
  const log = vi.fn()
  renderNewCommandBanner({error: vi.fn() as never, log, warn: vi.fn()})
  return (
    log.mock.calls
      .map(([line]) => String(line ?? ''))
      .join('\n')
      // eslint-disable-next-line no-control-regex -- strip ANSI styling
      .replaceAll(/\u001B\[[0-9;]*m/g, '')
      // eslint-disable-next-line no-control-regex -- strip OSC 8 hyperlink wrappers
      .replaceAll(/\u001B\]8;;[^\u0007]*\u0007/g, '')
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('#renderNewCommandBanner', () => {
  test('renders the two-ways-to-start signpost box, blank-line padded', () => {
    const banner = render()

    expect(banner).toContain('Two ways to start')
    expect(banner).toContain('sanity init')
    expect(banner).toContain('sanity new')
    expect(banner).toContain('claim it within 72 hours')
    expect(banner).toContain('https://sanity.new')
    expect(banner).toContain('╭') // boxed — the one-time signpost keeps its box
    expect(banner.startsWith('\n')).toBe(true)
    expect(banner.endsWith('\n')).toBe(true)
  })

  test('ignores the retired SANITY_NEW_BANNER switch', () => {
    vi.stubEnv('SANITY_NEW_BANNER', '3')

    expect(render()).toContain('Two ways to start')
  })
})

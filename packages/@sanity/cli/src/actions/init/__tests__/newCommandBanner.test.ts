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
  test('defaults to the whisper variant', () => {
    const banner = render()

    expect(banner).toContain("Don't want to log in yet?")
    expect(banner).toContain('sanity new')
    expect(banner).toContain('https://sanity.new')
  })

  test('falls back to the whisper variant for unknown values', () => {
    vi.stubEnv('SANITY_NEW_BANNER', 'nope')

    expect(render()).toContain("Don't want to log in yet?")
  })

  test('SANITY_NEW_BANNER=2 renders the signpost box', () => {
    vi.stubEnv('SANITY_NEW_BANNER', '2')

    const banner = render()

    expect(banner).toContain('Two ways to start')
    expect(banner).toContain('sanity init')
    expect(banner).toContain('sanity new')
    expect(banner).toContain('claim it within 72 hours')
    expect(banner).toContain('https://sanity.new')
    expect(banner).toContain('╭') // boxed
  })

  test('SANITY_NEW_BANNER=3 renders the marquee splash', () => {
    vi.stubEnv('SANITY_NEW_BANNER', '3')

    const banner = render()

    expect(banner).toContain('s a n i t y . n e w')
    expect(banner).toContain("Zero login. Instant project. Claim it when you're ready.")
    expect(banner).toContain('sanity new')
    expect(banner).toContain('https://sanity.new')
  })

  test('marquee respects NO_COLOR', () => {
    vi.stubEnv('SANITY_NEW_BANNER', '3')
    vi.stubEnv('NO_COLOR', '1')

    const log = vi.fn()
    renderNewCommandBanner({error: vi.fn() as never, log, warn: vi.fn()})
    const raw = log.mock.calls.map(([line]) => String(line ?? '')).join('\n')

    expect(raw).toContain('⚡ s a n i t y . n e w')
    expect(raw).not.toContain('38;2;') // no truecolor escapes
  })
})

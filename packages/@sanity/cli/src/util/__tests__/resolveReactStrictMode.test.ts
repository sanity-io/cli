import {type CliConfig} from '@sanity/cli-core/types'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveReactStrictMode} from '../resolveReactStrictMode'

describe('resolveReactStrictMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // The pass-through is the whole point: a missing setting must stay `undefined`
  // so the studio runtime applies its own default instead of strict mode off.
  test('returns undefined when neither env var nor config sets it', () => {
    expect(resolveReactStrictMode(undefined)).toBeUndefined()
    expect(resolveReactStrictMode({} as CliConfig)).toBeUndefined()
  })

  test('reflects the config value when set', () => {
    expect(resolveReactStrictMode({reactStrictMode: true} as CliConfig)).toBe(true)
    expect(resolveReactStrictMode({reactStrictMode: false} as CliConfig)).toBe(false)
  })

  test('env var wins over config', () => {
    vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'true')
    expect(resolveReactStrictMode({reactStrictMode: false} as CliConfig)).toBe(true)

    vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'false')
    expect(resolveReactStrictMode({reactStrictMode: true} as CliConfig)).toBe(false)
  })
})

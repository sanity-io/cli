import {describe, expect, test} from 'vitest'

import {getEntryModule} from '../getEntryModule'

describe('getEntryModule', () => {
  test('emits reactStrictMode: undefined when the option is undefined, deferring to the studio default', () => {
    const output = getEntryModule({
      reactStrictMode: undefined,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain('reactStrictMode: undefined')
  })

  test('emits reactStrictMode: undefined for the no-config template too', () => {
    const output = getEntryModule({
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    expect(output).toContain('reactStrictMode: undefined')
    expect(output).toContain('missingConfigFile: true')
  })

  test('emits a concrete reactStrictMode: true when explicitly enabled', () => {
    const output = getEntryModule({
      reactStrictMode: true,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain('reactStrictMode: true')
  })

  test('emits a concrete reactStrictMode: false when explicitly disabled', () => {
    const output = getEntryModule({
      reactStrictMode: false,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain('reactStrictMode: false')
  })

  test('never references reactStrictMode for the app entry module', () => {
    const output = getEntryModule({
      isApp: true,
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    expect(output).not.toContain('reactStrictMode')
    expect(output).toContain('createRoot')
  })
})

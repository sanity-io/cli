import {describe, expect, test} from 'vitest'

import {registryConfig} from '../registry.ts'

describe('registryConfig', () => {
  test('keeps npm metadata for years and allows anonymous publishing', () => {
    const config = registryConfig('/state/registry/storage')
    expect(config).toContain('storage: "/state/registry/storage"')
    expect(config).toContain('    maxage: 3650d')
    expect(config).toContain('    publish: $anonymous')
    expect(config).toContain('    proxy: npmjs')
    expect(config).toContain('max_body_size: 500mb')
  })
})

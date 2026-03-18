import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
} from '../getStudioEnvironmentVariables.js'

describe('#getStudioEnvironmentVariables', () => {
  beforeEach(() => {
    // Set a controlled process.env with both prefixed and non-prefixed vars
    vi.stubEnv('SANITY_STUDIO_API_KEY', 'studio-key-123')
    vi.stubEnv('SANITY_STUDIO_PROJECT_ID', 'proj-abc')
    vi.stubEnv('SANITY_APP_SECRET', 'app-secret-456')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://next.example.com')
    vi.stubEnv('VITE_CUSTOM_VAR', 'vite-value')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('only returns SANITY_STUDIO_ prefixed vars from process.env', () => {
    const result = getStudioEnvironmentVariables()

    expect(result).toHaveProperty('SANITY_STUDIO_API_KEY', 'studio-key-123')
    expect(result).toHaveProperty('SANITY_STUDIO_PROJECT_ID', 'proj-abc')

    // Must NOT contain non-prefixed vars
    const keys = Object.keys(result)
    for (const key of keys) {
      expect(key).toMatch(/^SANITY_STUDIO_/)
    }
  })

  test('does not return PATH, HOME, NEXT_PUBLIC_*, VITE_*, or SANITY_APP_* vars', () => {
    const result = getStudioEnvironmentVariables()

    expect(result).not.toHaveProperty('PATH')
    expect(result).not.toHaveProperty('HOME')
    expect(result).not.toHaveProperty('NEXT_PUBLIC_API_URL')
    expect(result).not.toHaveProperty('VITE_CUSTOM_VAR')
    expect(result).not.toHaveProperty('SANITY_APP_SECRET')
  })

  test('applies jsonEncode option', () => {
    const result = getStudioEnvironmentVariables({jsonEncode: true})

    expect(result).toHaveProperty('SANITY_STUDIO_API_KEY', '"studio-key-123"')
    expect(result).toHaveProperty('SANITY_STUDIO_PROJECT_ID', '"proj-abc"')
  })

  test('applies prefix option', () => {
    const result = getStudioEnvironmentVariables({prefix: 'process.env.'})

    expect(result).toHaveProperty('process.env.SANITY_STUDIO_API_KEY', 'studio-key-123')
    expect(result).toHaveProperty('process.env.SANITY_STUDIO_PROJECT_ID', 'proj-abc')
    expect(result).not.toHaveProperty('SANITY_STUDIO_API_KEY')
  })

  test('applies both prefix and jsonEncode options', () => {
    const result = getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})

    expect(result).toHaveProperty('process.env.SANITY_STUDIO_API_KEY', '"studio-key-123"')
  })

  test('returns empty object when no SANITY_STUDIO_ vars exist', () => {
    // Stub any SANITY_STUDIO_ vars as undefined so they're removed from process.env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SANITY_STUDIO_')) {
        vi.stubEnv(key, undefined as unknown as string)
      }
    }

    const result = getStudioEnvironmentVariables()

    const studioKeys = Object.keys(result).filter((k) => k.startsWith('SANITY_STUDIO_'))
    expect(studioKeys).toHaveLength(0)
  })
})

describe('#getAppEnvironmentVariables', () => {
  beforeEach(() => {
    vi.stubEnv('SANITY_APP_SECRET', 'app-secret-456')
    vi.stubEnv('SANITY_APP_ORG_ID', 'org-789')
    vi.stubEnv('SANITY_STUDIO_API_KEY', 'studio-key-123')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://next.example.com')
    vi.stubEnv('VITE_CUSTOM_VAR', 'vite-value')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('only returns SANITY_APP_ prefixed vars from process.env', () => {
    const result = getAppEnvironmentVariables()

    expect(result).toHaveProperty('SANITY_APP_SECRET', 'app-secret-456')
    expect(result).toHaveProperty('SANITY_APP_ORG_ID', 'org-789')

    // Must NOT contain non-prefixed vars
    const keys = Object.keys(result)
    for (const key of keys) {
      expect(key).toMatch(/^SANITY_APP_/)
    }
  })

  test('does not return PATH, HOME, NEXT_PUBLIC_*, VITE_*, or SANITY_STUDIO_* vars', () => {
    const result = getAppEnvironmentVariables()

    expect(result).not.toHaveProperty('PATH')
    expect(result).not.toHaveProperty('HOME')
    expect(result).not.toHaveProperty('NEXT_PUBLIC_API_URL')
    expect(result).not.toHaveProperty('VITE_CUSTOM_VAR')
    expect(result).not.toHaveProperty('SANITY_STUDIO_API_KEY')
  })

  test('applies jsonEncode option', () => {
    const result = getAppEnvironmentVariables({jsonEncode: true})

    expect(result).toHaveProperty('SANITY_APP_SECRET', '"app-secret-456"')
    expect(result).toHaveProperty('SANITY_APP_ORG_ID', '"org-789"')
  })

  test('applies prefix option', () => {
    const result = getAppEnvironmentVariables({prefix: 'process.env.'})

    expect(result).toHaveProperty('process.env.SANITY_APP_SECRET', 'app-secret-456')
    expect(result).toHaveProperty('process.env.SANITY_APP_ORG_ID', 'org-789')
    expect(result).not.toHaveProperty('SANITY_APP_SECRET')
  })

  test('applies both prefix and jsonEncode options', () => {
    const result = getAppEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})

    expect(result).toHaveProperty('process.env.SANITY_APP_SECRET', '"app-secret-456"')
  })

  test('returns empty object when no SANITY_APP_ vars exist', () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SANITY_APP_')) {
        vi.stubEnv(key, undefined as unknown as string)
      }
    }

    const result = getAppEnvironmentVariables()

    const appKeys = Object.keys(result).filter((k) => k.startsWith('SANITY_APP_'))
    expect(appKeys).toHaveLength(0)
  })
})

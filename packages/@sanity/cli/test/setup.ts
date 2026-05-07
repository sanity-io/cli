import {clearCliTokenCache} from '@sanity/cli-core'
import {beforeEach, vi} from 'vitest'

/**
 * Default mocks
 */
// Mock open, to prevent it from opening a browser
vi.mock('open')

/**
 * Clear the CLI token cache before each test to ensure test isolation.
 * This prevents tests from depending on token state from previous tests.
 */
beforeEach(() => {
  clearCliTokenCache()
})

/**
 * Stub a default test token for tests that require authentication.
 * Individual tests can override this by setting SANITY_AUTH_TOKEN to a different value.
 */
vi.stubEnv('SANITY_AUTH_TOKEN', 'test-token-for-cli-tests')

import {vi} from 'vitest'

/**
 * Default mocks
 */
// Mock open, to prevent it from opening a browser
vi.mock('open')

// Mock findProjectRoot, as baseline
vi.mock(import('../src/config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

// Mock getCliConfig, as baseline
vi.mock(import('../src/config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn().mockResolvedValue({}),
  }
})

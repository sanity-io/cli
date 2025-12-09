import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCliConfigSync} from '../cli/getCliConfigSync'

// Mock node:fs
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

describe('getCliConfigSync', () => {
  const mockRootPath = '/mock/project'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  test('throws error when no CLI config found', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockReturnValue(false)

    expect(() => getCliConfigSync(mockRootPath)).toThrow('No CLI config found at')
  })

  test('throws error when multiple config files found', async () => {
    const {existsSync} = await import('node:fs')

    vi.mocked(existsSync).mockReturnValue(true)

    expect(() => getCliConfigSync(mockRootPath)).toThrow('Multiple CLI config files found')
  })
})

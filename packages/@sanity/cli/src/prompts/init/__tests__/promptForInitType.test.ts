import {select} from '@sanity/cli-core/ux'
import {afterEach, expect, test, vi} from 'vitest'

import {promptForInitType} from '../promptForInitType.js'

vi.mock('@sanity/cli-core/ux', () => ({select: vi.fn()}))

afterEach(() => {
  vi.clearAllMocks()
})

test.each(['studio', 'app'] as const)('returns the selected %s type', async (type) => {
  vi.mocked(select).mockResolvedValueOnce(type)

  await expect(promptForInitType()).resolves.toBe(type)

  expect(select).toHaveBeenCalledWith({
    choices: [
      {
        description: expect.stringContaining('https://www.sanity.io/studio'),
        name: 'Sanity Studio',
        value: 'studio',
      },
      {
        description: expect.stringContaining('https://www.sanity.io/app-sdk'),
        name: 'App SDK',
        value: 'app',
      },
    ],
    default: 'studio',
    message: 'What would you like to create?',
  })
})

test('propagates cancellation', async () => {
  const error = new Error('User cancelled')
  vi.mocked(select).mockRejectedValueOnce(error)

  await expect(promptForInitType()).rejects.toBe(error)
})

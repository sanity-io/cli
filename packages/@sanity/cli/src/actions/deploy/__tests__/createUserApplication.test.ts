import {input} from '@sanity/cli-core/ux'
import {describe, expect, test, vi} from 'vitest'

import {
  createUserApplication as createUserApplicationRequest,
  type UserApplication,
} from '../../../services/userApplications.js'
import {createUserApplication} from '../createUserApplication.js'

vi.mock('../../../services/userApplications.js', () => ({
  createUserApplication: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const {createMockSpinner} = await import('@sanity/cli-test')
  return {
    ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
    input: vi.fn(),
    spinner: createMockSpinner({
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }),
  }
})

const mockRequest = vi.mocked(createUserApplicationRequest)
const mockInput = vi.mocked(input)

describe('createUserApplication', () => {
  test('should create with the given title without prompting', async () => {
    const app = {title: 'My App'} as UserApplication
    mockRequest.mockResolvedValue(app)

    const result = await createUserApplication('org-1', 'My App')

    expect(mockInput).not.toHaveBeenCalled()
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        appType: 'coreApp',
        body: expect.objectContaining({title: 'My App', type: 'coreApp', urlType: 'internal'}),
        organizationId: 'org-1',
      }),
    )
    expect(result).toBe(app)
  })
})

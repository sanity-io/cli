import {input} from '@sanity/cli-core/ux'
import {describe, expect, test, vi} from 'vitest'

import {
  createUserApplication as createUserApplicationRequest,
  type UserApplication,
} from '../../../services/userApplications.js'
import {createUserApplication, generateAppSlug} from '../createUserApplication.js'

vi.mock('../../../services/userApplications.js', () => ({
  createUserApplication: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

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

describe('generateAppSlug', () => {
  test('is 12 chars, lowercase, and letter-first', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateAppSlug()).toMatch(/^[a-z][a-z0-9]{11}$/)
    }
  })

  test('is random across calls', () => {
    expect(generateAppSlug()).not.toBe(generateAppSlug())
  })
})

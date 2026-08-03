import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaValidate} from '../validate.js'

const mockValidateAction = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)

vi.mock('../../../actions/schema/validateAction.js', () => ({validateAction: mockValidateAction}))

describe('schema validate command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should invoke validateAction action', async () => {
    await SchemaValidate.run([])
    expect(mockValidateAction).toHaveBeenCalledOnce()
  })
  test('should error if validateAction throws', async () => {
    mockValidateAction.mockRejectedValue(new Error('boom'))
    await SchemaValidate.run([])
    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith('Error validating schema: boom', {
      exit: 1,
    })
  })
})

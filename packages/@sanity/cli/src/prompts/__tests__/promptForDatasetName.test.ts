import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForDatasetName} from '../promptForDatasetName.js'

const mockValidate = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../actions/dataset/validateDatasetName.js', () => ({
  validateDatasetName: mockValidate,
}))

describe('promptForDatasetName', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  test('should default to message "Dataset name:" if none provided', () => {
    promptForDatasetName()
    expect(uxMocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Dataset name:',
      }),
    )
  })
  describe('validation', () => {
    test('should prevent duplicate dataset names', () => {
      expect.assertions(1)
      const userSelection = 'robin'
      uxMocks.input.mockImplementation((opts) => {
        const validationResult = opts.validate(userSelection)
        expect(validationResult).toEqual('Dataset name already exists')
      })
      promptForDatasetName({}, ['robin'])
    })
    test('should prevent invalid dataset names', () => {
      expect.assertions(1)
      const err = 'laughable name'
      mockValidate.mockReturnValue(err)
      const userSelection = 'robin'
      uxMocks.input.mockImplementation((opts) => {
        const validationResult = opts.validate(userSelection)
        expect(validationResult).toEqual(err)
      })
      promptForDatasetName({}, ['batman'])
    })
    test('should be ok with non-duplicate name that passes name validation', () => {
      expect.assertions(1)
      mockValidate.mockReturnValue(null)
      const userSelection = 'robin'
      uxMocks.input.mockImplementation((opts) => {
        const validationResult = opts.validate(userSelection)
        expect(validationResult).toEqual(true)
      })
      promptForDatasetName({}, ['batman'])
    })
  })
})

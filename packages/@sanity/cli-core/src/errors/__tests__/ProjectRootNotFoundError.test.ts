import {describe, expect, test} from 'vitest'

import {isProjectRootNotFoundError, ProjectRootNotFoundError} from '../ProjectRootNotFoundError.js'

describe('ProjectRootNotFoundError', () => {
  test('creates an error with the correct properties', () => {
    const error = new ProjectRootNotFoundError('No project root found')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ProjectRootNotFoundError)
    expect(error.message).toBe('No project root found')
    expect(error.name).toBe('ProjectRootNotFoundError')
    expect(error.code).toBe('PROJECT_ROOT_NOT_FOUND')
  })
})

describe('isProjectRootNotFoundError', () => {
  test('returns true for ProjectRootNotFoundError instances', () => {
    const error = new ProjectRootNotFoundError('test')
    expect(isProjectRootNotFoundError(error)).toBe(true)
  })

  test('returns true for duck-typed errors with matching properties', () => {
    const error = {
      code: 'PROJECT_ROOT_NOT_FOUND',
      message: 'No project root found',
      name: 'ProjectRootNotFoundError',
    }
    expect(isProjectRootNotFoundError(error)).toBe(true)
  })

  test('returns false for generic errors', () => {
    const error = new Error('No project root found')
    expect(isProjectRootNotFoundError(error)).toBe(false)
  })

  test('returns false for null/undefined', () => {
    expect(isProjectRootNotFoundError(null)).toBe(false)
    expect(isProjectRootNotFoundError(undefined)).toBe(false)
  })

  test('returns false for non-error objects', () => {
    expect(isProjectRootNotFoundError('string')).toBe(false)
    expect(isProjectRootNotFoundError(42)).toBe(false)
    expect(isProjectRootNotFoundError({})).toBe(false)
  })
})

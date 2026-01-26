import {describe, expect, test} from 'vitest'

import {validateProjectName} from '../validateProjectName.js'

describe('validateProjectName', () => {
  test.each([
    ['My Project'],
    ['A'],
    ['Project-Name'],
    ['🚀 My Project'],
    ['プロジェクト'],
    ['a'.repeat(80)], // Exactly 80 characters (max)
  ])('returns true for valid project name: "%s"', (projectName) => {
    expect(validateProjectName(projectName)).toBe(true)
  })

  test.each([
    ['', 'Project name cannot be empty'],
    ['   ', 'Project name cannot be empty'],
    ['\t\n  ', 'Project name cannot be empty'],
  ])('returns error for empty or whitespace: "%s"', (projectName, expected) => {
    expect(validateProjectName(projectName)).toBe(expected)
  })

  test('returns error for names longer than 80 characters', () => {
    expect(validateProjectName('a'.repeat(81))).toBe(
      'Project name cannot be longer than 80 characters',
    )
  })
})

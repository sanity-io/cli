import {describe, expect, test} from 'vitest'

import {buildArgs} from '../pack.ts'

describe('buildArgs', () => {
  test('builds the packed packages and their workspace dependencies', () => {
    expect(buildArgs()).toEqual([
      'exec',
      'turbo',
      'run',
      'build',
      'build:types',
      '--filter=@sanity/cli...',
      '--filter=create-sanity...',
    ])
  })
})

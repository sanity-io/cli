import {describe, expect, test} from 'vitest'

import {cliConfigSchema} from '../schemas.js'

describe('cliConfigSchema', () => {
  test('accepts dataset app resources', () => {
    const result = cliConfigSchema.parse({
      app: {
        resources: {
          default: {
            dataset: 'production',
            projectId: 'project-123',
          },
        },
      },
    })

    expect(result.app?.resources?.default).toEqual({
      dataset: 'production',
      projectId: 'project-123',
    })
  })

  test('rejects unknown resource shapes', () => {
    expect(() =>
      cliConfigSchema.parse({
        app: {resources: {bad: {}}},
      }),
    ).toThrow()
  })
})

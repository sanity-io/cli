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

  test('accepts media library app resources', () => {
    const result = cliConfigSchema.parse({
      app: {
        resources: {
          media: {
            mediaLibraryId: 'library-123',
          },
        },
      },
    })

    expect(result.app?.resources?.media).toEqual({
      mediaLibraryId: 'library-123',
    })
  })

  test('accepts canvas app resources', () => {
    const result = cliConfigSchema.parse({
      app: {
        resources: {
          canvas: {
            canvasId: 'canvas-123',
          },
        },
      },
    })

    expect(result.app?.resources?.canvas).toEqual({
      canvasId: 'canvas-123',
    })
  })
})

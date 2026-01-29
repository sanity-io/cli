import {testCommand} from '@sanity/cli-test'
import {describe, expect, test, vi} from 'vitest'

import {validateAction} from '../../../actions/schema/validateAction.js'
import {SchemaValidate} from '../validate.js'

vi.mock('../../../actions/schema/validateAction.js', () => ({
  validateAction: vi.fn(),
}))

describe('#schema:validate', () => {
  test('shows error when user inputs incorrect format flag', async () => {
    const {error} = await testCommand(SchemaValidate, ['--format', 'invalid'], {
      mocks: {
        projectRoot: {
          directory: '/test/project',
          path: '/test/project/sanity.config.ts',
          type: 'studio',
        },
      },
    })

    expect(error?.message).toContain('Expected --format=invalid to be one of: pretty, ndjson, json')
  })

  test('shows error when user inputs incorrect level flag', async () => {
    const {error} = await testCommand(SchemaValidate, ['--level', 'invalid'], {
      mocks: {
        projectRoot: {
          directory: '/test/project',
          path: '/test/project/sanity.config.ts',
          type: 'studio',
        },
      },
    })

    expect(error?.message).toContain('Expected --level=invalid to be one of: error, warning')
  })

  test('calls validate action with correct parameters', async () => {
    vi.mocked(validateAction).mockResolvedValueOnce(undefined)

    const {error} = await testCommand(
      SchemaValidate,
      ['--format', 'json', '--level', 'error', '--workspace', 'default'],
      {
        mocks: {
          projectRoot: {
            directory: '/test/project',
            path: '/test/project/sanity.config.ts',
            type: 'studio',
          },
        },
      },
    )

    expect(error).toBeUndefined()
    expect(validateAction).toHaveBeenCalledWith({
      debugMetafilePath: undefined,
      format: 'json',
      level: 'error',
      output: expect.any(Object),
      workDir: '/test/project',
      workspace: 'default',
    })
  })
})

import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {describe, expect, test, vi} from 'vitest'

import {validateAction} from '../../../actions/schema/validateAction.js'
import {SchemaValidate} from '../validate.js'

vi.mock('../../../actions/schema/validateAction.js', () => ({
  validateAction: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/project',
    path: '/test/project/sanity.config.ts',
    type: 'studio',
  }),
}))

describe('#schema:validate', () => {
  test('--help works', async () => {
    const {stdout} = await runCommand(['schema:validate', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Validates all schema types specified in a workspace

      USAGE
        $ sanity schema validate [--debug-metafile-path <value>] [--format
          pretty|ndjson|json] [--level error|warning] [--workspace <value>]

      FLAGS
        --format=<option>    [default: pretty] The output format used to print schema
                             errors and warnings
                             <options: pretty|ndjson|json>
        --level=<option>     [default: warning] The minimum level reported out
                             <options: error|warning>
        --workspace=<value>  The name of the workspace to use when validating all
                             schema types

      DEBUG FLAGS
        --debug-metafile-path=<value>  Optional path where a metafile will be written
                                       for build analysis. Only written on successful
                                       validation. Can be analyzed at
                                       https://esbuild.github.io/analyze/

      DESCRIPTION
        Validates all schema types specified in a workspace

      EXAMPLES
        Validates all schema types in a Sanity project with more than one workspace

          $ sanity schema validate --workspace default

        Save the results of the report into a file

          $ sanity schema validate > report.txt

        Report out only errors

          $ sanity schema validate --level error

        Generate a report which can be analyzed with
        https://esbuild.github.io/analyze/

          $ sanity schema validate --debug-metafile-path metafile.json

      "
    `)
  })

  test('shows error when user inputs incorrect format flag', async () => {
    const {error} = await testCommand(SchemaValidate, ['--format', 'invalid'])

    expect(error?.message).toContain('Expected --format=invalid to be one of: pretty, ndjson, json')
  })

  test('shows error when user inputs incorrect level flag', async () => {
    const {error} = await testCommand(SchemaValidate, ['--level', 'invalid'])

    expect(error?.message).toContain('Expected --level=invalid to be one of: error, warning')
  })

  test('calls validate action with correct parameters', async () => {
    vi.mocked(validateAction).mockResolvedValueOnce(undefined)

    const {error} = await testCommand(SchemaValidate, [
      '--format',
      'json',
      '--level',
      'error',
      '--workspace',
      'default',
    ])

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

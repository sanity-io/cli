import {runCommand} from '@oclif/test'
import {describe, expect, it} from 'vitest'

describe('#typegen', () => {
  it('should print typegen help', async () => {
    const {stdout} = await runCommand('typegen --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Beta: Generate TypeScript types for schema and GROQ

      USAGE
        $ sanity typegen COMMAND

      COMMANDS
        typegen generate  Sanity TypeGen (Beta)

      "
    `)
  })

  it('should print typegen generate help', async () => {
    const {stdout} = await runCommand('typegen generate --help')

    expect(stdout).toContain('Sanity TypeGen')
  })
})

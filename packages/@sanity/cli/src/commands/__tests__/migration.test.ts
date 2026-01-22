import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

describe('#migration', () => {
  test('should print migrations help', async () => {
    const {stdout} = await runCommand('migration --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Create a new migration within your project

      USAGE
        $ sanity migration COMMAND

      COMMANDS
        migration create  Create a new migration within your project
        migration list    List available migrations
        migration run     Run a migration against a dataset

      "
    `)
  })

  test('should print migration create help', async () => {
    const {stdout} = await runCommand('migration create --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Create a new migration within your project

      USAGE
        $ sanity migration create [TITLE]

      ARGUMENTS
        [TITLE]  Title of migration

      DESCRIPTION
        Create a new migration within your project

      EXAMPLES
        Create a new migration, prompting for title and options

          $ sanity migration create

        Create a new migration with the provided title, prompting for options

          $ sanity migration create "Rename field from location to address"

      "
    `)
  })

  test('should print migration list help', async () => {
    const {stdout} = await runCommand('migration list --help')
    expect(stdout).toMatchInlineSnapshot(`
      "List available migrations

      USAGE
        $ sanity migration list

      DESCRIPTION
        List available migrations

      EXAMPLES
        List all available migrations in the project

          $ sanity migration list

      "
    `)
  })

  test('should print migration run help', async () => {
    const {stdout} = await runCommand('migration run --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Run a migration against a dataset

      USAGE
        $ sanity migration run [ID] [--api-version <value>] [--concurrency
          <value>] [--confirm] [--dataset <value>] [--dry-run] [--from-export <value>]
          [--progress] [--project <value>]

      ARGUMENTS
        [ID]  ID

      FLAGS
        --api-version=<value>  API version to use when migrating. Defaults to
                               v2024-01-29.
        --concurrency=<value>  [default: 6] How many mutation requests to run in
                               parallel. Must be between 1 and 10. Default: 6.
        --[no-]confirm         Prompt for confirmation before running the migration
                               (default: true). Use --no-confirm to skip.
        --dataset=<value>      Dataset to migrate. Defaults to the dataset configured
                               in your Sanity CLI config.
        --[no-]dry-run         By default the migration runs in dry mode. Use
                               --no-dry-run to migrate dataset.
        --from-export=<value>  Use a local dataset export as source for migration
                               instead of calling the Sanity API. Note: this is only
                               supported for dry runs.
        --[no-]progress        Display progress during migration (default: true). Use
                               --no-progress to hide output.
        --project=<value>      Project ID of the dataset to migrate. Defaults to the
                               projectId configured in your Sanity CLI config.

      DESCRIPTION
        Run a migration against a dataset

      EXAMPLES
        dry run the migration

          $ sanity migration run <id>

        execute the migration against a dataset

          $ sanity migration run <id> --no-dry-run --project xyz --dataset staging

        execute the migration using a dataset export as the source

          $ sanity migration run <id> --from-export=production.tar.gz --no-dry-run \\
            --project xyz --dataset staging

      "
    `)
  })
})

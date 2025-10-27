import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

describe('#dataset:import', () => {
  test('should print datasets:import help', async () => {
    const {stdout} = await runCommand('dataset import --help')

    expect(stdout).toMatchInlineSnapshot(`
      "Import documents to a Sanity dataset

      USAGE
        $ sanity dataset import SOURCE -p <value> -d <value> [-t <value>]
          [--replace | --missing] [--allow-failing-assets]
          [--allow-assets-in-different-dataset] [--replace-assets]
          [--skip-cross-dataset-references] [--allow-system-documents]
          [--asset-concurrency <value>]

      ARGUMENTS
        SOURCE  Source file (use "-" for stdin)

      FLAGS
        -d, --dataset=<value>                    (required) Dataset to import to
        -p, --project=<value>                    (required) Project ID to import to
        -t, --token=<value>                      Token to authenticate with
            --allow-assets-in-different-dataset  Allow asset documents to reference
                                                 different project/dataset
            --allow-failing-assets               Skip assets that cannot be
                                                 fetched/uploaded
            --allow-system-documents             Imports system documents
            --asset-concurrency=<value>          Number of parallel asset imports
            --missing                            Skip documents that already exist
            --replace                            Replace documents with the same IDs
            --replace-assets                     Skip reuse of existing assets
            --skip-cross-dataset-references      Skips references to other datasets

      DESCRIPTION
        Import documents to a Sanity dataset

      EXAMPLES
        Import "./my-dataset.ndjson" into dataset "staging"

          $ sanity dataset import -p myPrOj -d staging -t someSecretToken \\
            my-dataset.ndjson

        Import into dataset "test" from stdin, read token from env var

          cat my-dataset.ndjson | sanity dataset import -p myPrOj -d test -

      "
    `)
  })
})

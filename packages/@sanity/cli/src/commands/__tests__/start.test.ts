import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

describe('#start', () => {
  test('help works', async () => {
    const {stdout} = await runCommand(['start', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Starts a server to preview a production build

      USAGE
        $ sanity start [OUTPUTDIR] [--host <value>] [--port <value>]

      ARGUMENTS
        [OUTPUTDIR]  Output directory

      FLAGS
        --host=<value>  [default: localhost] The local network interface at which to
                        listen.
        --port=<value>  [default: 3333] TCP port to start server on.

      DESCRIPTION
        Starts a server to preview a production build

      ALIASES
        $ sanity start

      EXAMPLES
        $ sanity start --host=0.0.0.0

        $ sanity start --port=1942

        $ sanity start some/build-output-dir

      "
    `)
  })

  // Other tests are located in `preview.test.ts` - `start` is just an alias
})

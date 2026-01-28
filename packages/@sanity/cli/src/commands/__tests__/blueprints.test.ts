import {runCommand} from '@oclif/test'
import {describe, expect, it} from 'vitest'

describe('#blueprints', () => {
  it('should print blueprints help', async () => {
    const {stdout} = await runCommand(['blueprints', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Local Blueprint and remote Stack management commands

      USAGE
        $ sanity blueprints COMMAND

      COMMANDS
        blueprints add      Add a function resource to a Blueprint
        blueprints config   View or edit the local Blueprint configuration
        blueprints deploy   Deploy the local Blueprint to the remote Stack
        blueprints destroy  Destroy the remote Stack deployment and its resources
                            (will not delete local files)
        blueprints doctor   Diagnose potential issues with local Blueprint and remote
                            Stack configuration
        blueprints info     Show information about the local Blueprint's remote Stack
                            deployment
        blueprints init     Initialize a local Blueprint and optionally provision a
                            remote Stack deployment
        blueprints logs     Display logs for the current Blueprint's Stack deployment
        blueprints plan     Enumerate resources to be deployed to the remote Stack -
                            will not modify any resources
        blueprints stacks   List all remote Stack deployments (defaults to the current
                            Blueprint's project scope)

      "
    `)
  })
})

describe('#functions', () => {
  it('should print function help', async () => {
    const {stdout} = await runCommand(['functions', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Sanity Function development and management commands

      USAGE
        $ sanity functions COMMAND

      TOPICS
        functions env  Add or set an environment variable for a deployed function

      COMMANDS
        functions add   Add a Function to your Blueprint
        functions dev   Start the Sanity Function emulator
        functions logs  Retrieve or delete logs for a Sanity Function
        functions test  Invoke a local Sanity Function

      "
    `)
  })
})

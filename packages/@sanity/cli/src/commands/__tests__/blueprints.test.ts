import {runCommand} from '@oclif/test'
import {describe, expect, it} from 'vitest'

describe('#blueprints', () => {
  it('should print blueprints help', async () => {
    const {stdout} = await runCommand('blueprints --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Blueprint Stack deployment and management commands

      USAGE
        $ sanity blueprints COMMAND

      COMMANDS
        blueprints add      Add a Resource to a Blueprint
        blueprints config   View or edit Blueprint configuration
        blueprints deploy   Deploy a Blueprint
        blueprints destroy  Destroy a Blueprint Stack deployment and its resources
                            (will not delete local files)
        blueprints doctor   Diagnose potential issues with Blueprint configuration
        blueprints info     Show information about a Blueprint Stack deployment
        blueprints init     Initialize a new Blueprint Stack deployment
        blueprints logs     Display logs for a Blueprint Stack deployment
        blueprints plan     Enumerate resources to be deployed - will not modify any
                            resources
        blueprints stacks   List all Blueprint Stacks

      "
    `)
  })
})

describe('#functions', () => {
  it('should print function help', async () => {
    const {stdout} = await runCommand('functions --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Sanity Function development and management commands

      USAGE
        $ sanity functions COMMAND

      TOPICS
        functions env  Add or set the value of an environment variable for a Sanity
                       function

      COMMANDS
        functions add   Add a Function to your Blueprint
        functions dev   Start the Sanity Function emulator
        functions logs  Retrieve or delete logs for a Sanity Function
        functions test  Invoke a local Sanity Function

      "
    `)
  })
})

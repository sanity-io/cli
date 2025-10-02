import {SanityCommand} from '@sanity/cli-core'
import debug from 'debug'
import {render} from 'ink'

import {App} from '../components/agent/App.js'
import {AGENT_LOG_PATH} from '../services/agent/fileLogger.js'

export class AgentCommand extends SanityCommand<typeof AgentCommand> {
  static override description = 'Interactive agent for Sanity CLI operations'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Start the interactive agent',
    },
    {
      command: 'DEBUG=sanity:agent <%= config.bin %> <%= command.id %>',
      description: 'Start with debug logging enabled',
    },
  ]

  public async run(): Promise<void> {
    // Check if debug mode is enabled
    const isDebugMode = debug.enabled('sanity:agent')

    if (isDebugMode) {
      console.log('Debug mode enabled')
      console.log(`Logs will be saved to: ${AGENT_LOG_PATH}\n`)
    }

    // Render the Ink app
    const {waitUntilExit} = render(<App />)

    // Wait for the app to exit
    await waitUntilExit()
  }
}

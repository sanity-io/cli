import {SanityCommand} from '@sanity/cli-core'

import {setupMCP} from '../../actions/mcp/setupMCP.js'

export class ConfigureMcpCommand extends SanityCommand<typeof ConfigureMcpCommand> {
  static override description =
    'Configure Sanity MCP server for AI editors (Cursor, VS Code, Claude Code)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Configure Sanity MCP server for detected AI editors',
    },
  ]

  public async run(): Promise<void> {
    // @todo
    // const trace = telemetry.trace(MCPConfigureTrace)
    await setupMCP(true)

    // @todo
    // trace.log({
    //   detectedEditors: mcpResult.detectedEditors,
    //   configuredEditors: mcpResult.configuredEditors,
    // })
    // if (mcpResult.error) {
    //   trace.error(mcpResult.error)
    // }
    // trace.complete()
  }
}

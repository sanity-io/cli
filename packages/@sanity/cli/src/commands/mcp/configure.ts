import {SanityCommand} from '@sanity/cli-core'

import {setupMCP} from '../../actions/mcp/mcp.js'

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
    await setupMCP(true)

    // TODO: Add telemetry tracking
    // @todo
    // trace.log({
    //   step: 'mcpSetup',
    //   detectedEditors: mcpResult.detectedEditors,
    //   configuredEditors: mcpResult.configuredEditors,
    //   skipped: mcpResult.skipped,
    // })
    // if (mcpResult.error) {
    //   trace.error(mcpResult.error)
    // }
    // trace.complete()
  }
}

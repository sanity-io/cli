import {SanityCommand} from '@sanity/cli-core'

import {setupMCP} from '../../actions/mcp/setupMCP.js'
import {MCPConfigureTrace} from '../../telemetry/mcp.telemetry.js'

export class ConfigureMcpCommand extends SanityCommand<typeof ConfigureMcpCommand> {
  static override description =
    'Configure Sanity MCP server for AI editors (Claude Code, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Configure Sanity MCP server for detected AI editors',
    },
  ]

  public async run(): Promise<void> {
    const trace = this.telemetry.trace(MCPConfigureTrace)
    trace.start()
    const mcpResult = await setupMCP(true)

    trace.log({
      configuredEditors: mcpResult.configuredEditors,
      detectedEditors: mcpResult.detectedEditors,
    })

    if (mcpResult.error) {
      trace.error(mcpResult.error)
    } else {
      trace.complete()
    }
  }
}

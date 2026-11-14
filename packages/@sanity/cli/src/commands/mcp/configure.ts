import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {getErrorMessage, toError} from '@sanity/cli-core/errors'

import {setupMCP} from '../../actions/mcp/setupMCP.js'
import {MCPConfigureTrace} from '../../telemetry/mcp.telemetry.js'

export class ConfigureMcpCommand extends SanityCommand<typeof ConfigureMcpCommand> {
  static override description =
    'Configure Sanity MCP server for AI editors (Antigravity, Claude Code, Cline, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, MCPorter, OpenCode, VS Code, VS Code Insiders, Zed)'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Configure Sanity MCP server for detected AI editors',
    },
  ]

  public async run(): Promise<void> {
    const trace = this.telemetry.trace(MCPConfigureTrace)
    trace.start()

    try {
      const mcpResult = await setupMCP({
        explicit: true,
        mode: this.resolveIsInteractive() ? 'prompt' : 'auto',
        output: this.output,
        skillsMode: 'skip',
      })

      trace.log({
        configuredEditors: mcpResult.configuredEditors,
        detectedEditors: mcpResult.detectedEditors,
      })

      if (mcpResult.error) {
        trace.error(mcpResult.error)
      } else {
        trace.complete()
      }
    } catch (error) {
      trace.error(toError(error))
      this.error(getErrorMessage(error), {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}

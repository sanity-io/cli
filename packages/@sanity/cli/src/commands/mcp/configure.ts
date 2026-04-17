import {isInteractive, SanityCommand, subdebug} from '@sanity/cli-core'

import {ensureAuthenticated} from '../../actions/auth/ensureAuthenticated.js'
import {setupMCP} from '../../actions/mcp/setupMCP.js'
import {LoginError} from '../../errors/LoginError.js'
import {MCPConfigureTrace} from '../../telemetry/mcp.telemetry.js'
import {getErrorMessage, toError} from '../../util/getErrorMessage.js'

const debug = subdebug('mcp:configure')

export class ConfigureMcpCommand extends SanityCommand<typeof ConfigureMcpCommand> {
  static override description =
    'Configure Sanity MCP server for AI editors (Antigravity, Claude Code, Cline, Cline CLI, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, MCPorter, OpenCode, VS Code, VS Code Insiders, Zed)'

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
      await ensureAuthenticated({output: this.output, telemetry: this.telemetry})
    } catch (error) {
      debug('Authentication check failed: %O', error)
      trace.error(toError(error))

      if (error instanceof LoginError) {
        this.error(
          `Failed to verify authentication credentials: ${error.message}. Try running \`sanity login\`.`,
          {exit: 1},
        )
      }

      this.error(`Failed to check authentication: ${getErrorMessage(error)}`, {exit: 1})
    }

    try {
      const mcpResult = await setupMCP({explicit: true, mode: isInteractive() ? 'prompt' : 'auto'})

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
      this.error(getErrorMessage(error), {exit: 1})
    }
  }
}

import {checkbox} from '@inquirer/prompts'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {detectAvailableEditors} from '../../actions/mcp/detectAvailableEditors.js'
import {getEditorsWithExistingConfig} from '../../actions/mcp/getEditorsWithExistingConfig.js'
import {writeMCPConfig} from '../../actions/mcp/writeMCPConfig.js'
import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'

const mcpConfigureDebug = subdebug('mcp:configure')

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
    // const trace = telemetry.trace(MCPConfigureTrace)
    // 1. Detect available editors
    const detectedEditors = await detectAvailableEditors()

    if (detectedEditors.length === 0) {
      this.warn('No supported AI editors detected (Cursor, VS Code, Claude Code)')
      this.log(`Visit ${MCP_SERVER_URL} for manual setup instructions.`)
      // trace.log({
      //   detectedEditors: [],
      //   configuredEditors: [],
      // })
      // trace.complete()
      return
    }

    mcpConfigureDebug('Detected %d editors: %s', detectedEditors.length, detectedEditors)

    // 2. Check which editors already have Sanity MCP configured
    const editorsWithExisting = await getEditorsWithExistingConfig(detectedEditors)

    // 3. Prompt user to select which editors to configure
    const choices = detectedEditors.map((e) => {
      const isConfigured = editorsWithExisting.some((existing) => existing.name === e.name)
      return {
        checked: !isConfigured, // Pre-select only unconfigured
        name: isConfigured ? `${e.name} (already installed)` : e.name,
        value: e.name,
      }
    })

    const selectedEditorNames = await checkbox({
      choices,
      message: 'Configure Sanity MCP server?',
    })

    // 4. User can deselect all to skip
    if (!selectedEditorNames || selectedEditorNames.length === 0) {
      this.log('MCP configuration skipped')
      return
    }

    const selectedEditors = detectedEditors.filter((e) => selectedEditorNames.includes(e.name))

    // 5. Create child token for MCP
    let token: string
    try {
      token = await createMCPToken()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mcpConfigureDebug('Error creating MCP token', error)
      this.warn(`Could not configure MCP: ${message}`)
      this.warn(`You can set up MCP manually at ${MCP_SERVER_URL}`)
      return
    }

    // 6. Write configs for each selected editor
    try {
      for (const editor of selectedEditors) {
        await writeMCPConfig(editor, token)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mcpConfigureDebug('Error writing MCP config', error)
      this.warn(`Could not configure MCP: ${message}`)
      this.warn(`You can set up MCP manually at ${MCP_SERVER_URL}`)
      // trace.error(error)
      // trace.complete()
      return
    }

    // 7. Success message
    const configuredEditors = selectedEditors.map((e) => e.name).join(', ')
    this.log(`MCP configured for ${configuredEditors}`)

    // TODO: Add telemetry tracking
    // trace.log({
    //   configuredEditors: configuredEditors,
    //   detectedEditors: detectedEditors,
    // })
    // trace.complete()
  }
}

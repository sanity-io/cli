import {defineTrace} from '@sanity/telemetry'

import {type EditorName} from '../actions/mcp/editorConfigs.js'

interface MCPConfigureTraceData {
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
}

export const MCPConfigureTrace = defineTrace<MCPConfigureTraceData>({
  description: 'User completed MCP configuration via CLI',
  name: 'CLI MCP Configure Completed',
  version: 1,
})

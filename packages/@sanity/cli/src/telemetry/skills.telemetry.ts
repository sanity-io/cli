import {defineTrace} from '@sanity/telemetry'

import {type EditorName} from '../actions/mcp/editorConfigs.js'

interface SkillsConfigureTraceData {
  detectedEditors: EditorName[]
  installedAgents: string[]
}

export const SkillsConfigureTrace = defineTrace<SkillsConfigureTraceData>({
  description: 'User completed Sanity agent skills configuration via CLI',
  name: 'CLI Skills Configure Completed',
  version: 1,
})

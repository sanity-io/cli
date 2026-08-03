import {defineTrace} from '@sanity/telemetry'

import {type EditorName} from '../actions/mcp/editorConfigs.js'

interface SkillsInstallTraceData {
  detectedEditors: EditorName[]
  installedAgents: string[]
}

export const SkillsInstallTrace = defineTrace<SkillsInstallTraceData>({
  description: 'User completed Sanity agent skills installation via CLI',
  name: 'CLI Skills Install Completed',
  version: 1,
})

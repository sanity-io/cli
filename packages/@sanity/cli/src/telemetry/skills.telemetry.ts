import {defineTrace} from '@sanity/telemetry'

interface SkillsAddTraceData {
  /** `--agent` values passed to the bundled `skills add` */
  installedAgents: string[]
  /** Editor display names that received skills (e.g. "Cursor", "Claude Code") */
  installedForEditors: string[]
}

export const SkillsAddTrace = defineTrace<SkillsAddTraceData>({
  description: 'User ran `sanity skills add`',
  name: 'CLI Skills Add Completed',
  version: 1,
})

interface SkillsUpdateTraceData {
  succeeded: boolean
}

export const SkillsUpdateTrace = defineTrace<SkillsUpdateTraceData>({
  description: 'User ran `sanity skills update`',
  name: 'CLI Skills Update Completed',
  version: 1,
})

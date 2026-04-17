import {defineTrace} from '@sanity/telemetry'

import {type EditorName} from '../actions/mcp/editorConfigs.js'

interface StartStep {
  flags: Record<string, boolean | number | string | undefined>
  step: 'start'
}

interface LoginStep {
  step: 'login'

  alreadyLoggedIn?: boolean
}

interface FetchJourneyConfigStep {
  datasetName: string
  displayName: string
  isFirstProject: boolean
  projectId: string
  step: 'fetchJourneyConfig'
}

interface CreateOrSelectProjectStep {
  projectId: string
  selectedOption: 'create' | 'none' | 'select'
  step: 'createOrSelectProject'
}

interface CreateOrSelectDatasetStep {
  datasetName: string
  selectedOption: 'create' | 'none' | 'select'
  step: 'createOrSelectDataset'

  visibility?: 'private' | 'public'
}

interface UseDefaultPlanCoupon {
  selectedOption: 'no' | 'yes'
  step: 'useDefaultPlanCoupon'

  coupon?: string
}

interface UseDefaultPlanId {
  selectedOption: 'no' | 'yes'
  step: 'useDefaultPlanId'

  planId?: string
}

interface UseDetectedFrameworkStep {
  selectedOption: 'no' | 'yes'
  step: 'useDetectedFramework'

  detectedFramework?: string
}

interface UseTypeScriptStep {
  selectedOption: 'no' | 'yes'
  step: 'useTypeScript'
}

interface SelectTemplateStep {
  selectedOption: string
  step: 'selectProjectTemplate'
}
interface ImportTemplateDatasetStep {
  selectedOption: 'no' | 'yes'
  step: 'importTemplateDataset'
}

interface SendCommunityInviteStep {
  selectedOption: 'no' | 'yes'
  step: 'sendCommunityInvite'
}

interface SelectPackageManagerStep {
  selectedOption: string
  step: 'selectPackageManager'
}

interface MCPSetupStep {
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean
  step: 'mcpSetup'
}

export type InitStepResult =
  | CreateOrSelectDatasetStep
  | CreateOrSelectProjectStep
  | FetchJourneyConfigStep
  | ImportTemplateDatasetStep
  | LoginStep
  | MCPSetupStep
  | SelectPackageManagerStep
  | SelectTemplateStep
  | SendCommunityInviteStep
  | StartStep
  | UseDefaultPlanCoupon
  | UseDefaultPlanId
  | UseDetectedFrameworkStep
  | UseTypeScriptStep

export const CLIInitStepCompleted = defineTrace<InitStepResult>({
  description: 'User completed a step in the CLI init flow',
  name: 'CLI Init Step Completed',
  version: 1,
})

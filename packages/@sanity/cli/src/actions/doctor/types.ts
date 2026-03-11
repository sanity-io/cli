export interface DoctorCheck {
  name: string
  run(context: DoctorContext): Promise<CheckResult>
  title: string
}

export type CheckResultStatus = 'error' | 'passed' | 'warning'

export type MessageType = 'error' | 'info' | 'success' | 'warning'

export type SummaryTypes = 'errors' | 'passed' | 'warnings'

export interface DoctorContext {
  cwd: string
}

export interface CheckResult {
  messages: CheckMessage[]
  status: CheckResultStatus
}

export interface CheckMessage {
  text: string
  type: MessageType

  suggestions?: string[]
}

export interface DoctorResults {
  checks: CheckResultWithMeta[]
  summary: Record<SummaryTypes, number>
}

export interface CheckResultWithMeta extends CheckResult {
  name: string
  title: string
}

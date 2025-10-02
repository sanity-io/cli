export interface Message {
  content: string
  id: string
  role: 'agent' | 'error' | 'user'
  timestamp: Date

  failedToRevert?: boolean
  metadata?: {
    [key: string]: unknown
    reasoning?: {
      content: string
    }
  }
  revertable?: boolean
  reverted?: boolean
}

export interface CommandResult {
  handled: boolean

  message?: string
  shouldClear?: boolean
  shouldExit?: boolean
}

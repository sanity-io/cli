export type Hook = GroqHook | LegacyHook

export interface GroqHook {
  apiVersion: string
  createdAt: string
  createdByUserId: string
  dataset: string
  deletedAt: string | null
  description: string | null
  headers: Record<string, string | undefined>
  httpMethod: string
  id: string
  includeDrafts: boolean
  isDisabled: boolean
  isDisabledByUser: boolean
  name: string
  projectId: string
  rule: {
    filter: string | null
    on: ('create' | 'delete' | 'update')[]
    projection: string | null
  }
  secret: string | null
  type: 'document'
  url: string
}

export interface LegacyHook {
  createdAt: string
  createdByUserId: string
  dataset: string
  deletedAt: string | null
  description: string | null
  id: string
  isDisabled: boolean
  isDisabledByUser: boolean
  name: string
  projectId: string
  type: 'transaction'
  url: string
}

export type HookMessage = GroqHookMessage | LegacyHookMessage

export interface GroqHookMessage {
  createdAt: string
  dataset: string
  failureCount: number
  id: string
  payload: string
  projectId: string
  resultCode: number | null
  status: 'failure' | 'queued' | 'sending' | 'success'
}

export interface LegacyHookMessage {
  createdAt: string
  dataset: string
  deletedAt: string | null
  failureCount: number
  hookId: string
  id: string
  payload: string
  projectId: string
  resultCode: number | null
  status: 'failure' | 'queued' | 'sending' | 'success'
  updatedAt: string | null
}

export interface DeliveryAttempt {
  createdAt: string
  duration: number | null
  failureReason: string
  hookId: string
  id: string
  inProgress: boolean
  isFailure: boolean
  messageId: string
  projectId: string
  resultBody: string
  resultCode: number
  updatedAt: string | null
}

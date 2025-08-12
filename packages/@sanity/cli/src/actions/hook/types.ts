export type Hook = GroqHook | LegacyHook

interface GroqHook {
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

interface LegacyHook {
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

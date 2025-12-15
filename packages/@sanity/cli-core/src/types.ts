import {type Command} from '@oclif/core'

export interface Output {
  error: Command['error']
  log: Command['log']
  warn: Command['warn']
}

export type RequireProps<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

// @todo
// Replace with SanityUser type from client once implemented
export type SanityOrgUser = {
  email: string
  id: string
  name: string
  profileImage?: string
  provider: 'github' | 'google' | 'sanity' | `saml-${string}`
  tosAcceptedAt?: string
}

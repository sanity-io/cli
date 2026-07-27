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
  /**
   * Null when authenticating with an API token rather than a user account —
   * robot tokens resolve to a user whose `email` and `familyName` are null.
   * Use `getUserDisplayName()` for anything user-facing.
   */
  email: string | null
  id: string
  name: string
  profileImage?: string
  /** `sanity-token` is returned when authenticating with an API token. */
  provider: 'github' | 'google' | 'sanity' | 'sanity-token' | `saml-${string}`
  tosAcceptedAt?: string
}

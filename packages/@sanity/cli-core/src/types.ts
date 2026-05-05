/**
 * Abstraction over console output methods shared by both the oclif CLI
 * (`SanityCommand`) and the standalone `create-sanity` entry point.
 *
 * Signatures are defined explicitly to avoid a type-level dependency on
 * `@oclif/core` — keeping `Output` usable from oclif-free code paths.
 */
export interface Output {
  error(input: Error | string, options?: {exit?: number; suggestions?: string[]}): never
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches oclif's Command.log signature
  log(message?: string, ...args: any[]): void
  warn(input: Error | string): Error | string
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

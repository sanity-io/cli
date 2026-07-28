import {mcpPolicy} from './mcpPolicy.js'
import {type CommandPolicySet, type InvocationSource} from './policy.js'

export const commandPolicies: Record<InvocationSource, CommandPolicySet> = {
  mcp: mcpPolicy,
}

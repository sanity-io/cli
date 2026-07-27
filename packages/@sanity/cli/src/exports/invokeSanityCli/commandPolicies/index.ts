import {mcpPolicy} from './mcpPolicy'
import {CommandPolicySet, InvocationSource} from './policy'

export const commandPolicies: Record<InvocationSource, CommandPolicySet> = {
  mcp: mcpPolicy,
}

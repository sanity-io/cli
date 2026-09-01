---
'@sanity/cli-core': minor
'@sanity/cli': minor
---

feat: let plugins declare which of their commands are safe for programmatic invocation

Commands contributed by oclif plugins were unreachable from programmatic callers such as the MCP server, because the policy table only covered `@sanity/cli`'s own commands and only `SanityCommand` subclasses can run inside the CLI execution context. A plugin can now declare policies for the commands it contributes by pointing at a policy module from its package.json:

```json
{"sanity": {"invocationPolicies": "./dist/invocationPolicies.js"}}
```

The module exports an `invocationPolicies` table built from the new `@sanity/cli-core/commandPolicy` contract. Declaring a policy is a request, not a grant: entries for commands the plugin does not contribute are ignored, a plugin cannot take over a command the CLI already governs, the CLI can veto anything declared, and a command that does not extend `SanityCommand` is refused regardless of its policy. Plugins that declare nothing stay denied, so this changes no existing behaviour.

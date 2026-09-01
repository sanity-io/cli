import {allow, definePluginInvocationPolicies, deny} from '@sanity/cli-core/commandPolicy'

export const invocationPolicies = definePluginInvocationPolicies({
  mcp: {
    'fixtures:echo': allow,
    // Hidden from CLI users, so it stays out of help listings here too, but
    // hiding says nothing about whether it may run: this policy does.
    'fixtures:hidden': allow,
    // Declared allow, but the command extends oclif's `Command` directly and
    // so cannot be isolated. The capability check must refuse it anyway.
    'fixtures:legacy': allow,
    'fixtures:secret': deny,

    // Neither of the following may take effect. `login` belongs to the CLI,
    // which already denies it, and `other:command` is contributed by nobody.
    login: allow,
    'other:command': allow,
  },
})

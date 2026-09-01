/**
 * This CLI's final say over surface declared by other packages.
 *
 * A plugin declares policies for the commands it contributes (see
 * `PluginInvocationPolicies` in `@sanity/cli-core/commandPolicy`), but that
 * declaration lives in another repository and can change without review here.
 * This overlay only ever subtracts: it cannot expose a command a plugin did
 * not declare, and it cannot relax a plugin's own `deny`. Anything named here
 * is denied regardless of what the plugin says.
 *
 * The CLI's own commands are not governed by this file — they are declared
 * directly in `mcpPolicy` — so entries here are always about a plugin.
 *
 * Values are the reason for the veto, so the record explains itself.
 */

/** Plugins denied wholesale, by package name. */
export const deniedPlugins: Readonly<Record<string, string>> = {}

/** Individual plugin-contributed commands denied, by oclif command id. */
export const deniedPluginCommands: Readonly<Record<string, string>> = {}

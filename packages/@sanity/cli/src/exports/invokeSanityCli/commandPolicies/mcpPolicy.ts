import {
  allow,
  type CommandPolicySet,
  conditionalDenyFlags,
  conditionalPolicy,
  deny,
} from './policy.js'

/**
 * A typed `-F/--field` value of `@<file>` or `@-` makes the `api` command
 * read the host's filesystem or stdin (raw `-f` fields are always verbatim).
 */
function fieldReadsFromHost(field: unknown): boolean {
  if (typeof field !== 'string') return false
  const separatorIndex = field.indexOf('=')
  return separatorIndex > 0 && field[separatorIndex + 1] === '@'
}

/**
 * MCP programmatic mode disables local project/config discovery (see the CLI
 * execution context). Missing project or dataset values may therefore produce
 * a usage error, but cannot cause local filesystem access. Destructive remote
 * operations are allowed and do not by themselves make a command unsafe.
 *
 * Every manifest command must have exactly one policy here:
 * - allow: every valid invocation is safe
 * - conditional: safety depends on parsed arguments or flags
 * - deny: no invocation is safe
 */
export const mcpPolicy: CommandPolicySet = {
  // Special exception, this can be very dangerous but is also super useful
  // to expose. Refuse authentication overrides and host input channels:
  // `--token` replaces the MCP user's token, `--input` reads the request body
  // from the host's filesystem or stdin, and `-F key=@<file>` / `-F key=@-`
  // field values do the same.
  api: conditionalPolicy({
    deniedFlags: ['input', 'token'],
    validate: ({flags}) =>
      !Array.isArray(flags.field) || !flags.field.some((field) => fieldReadsFromHost(field)),
  }),

  'backups:disable': allow,
  // Writes a downloaded backup to the local filesystem.
  'backups:download': deny,
  'backups:enable': allow,
  'backups:list': allow,

  // Requires a local Studio project and writes build output to disk.
  build: deny,

  // Reads and rewrites local source code.
  codemod: deny,

  'cors:add': allow,
  'cors:delete': allow,
  'cors:list': allow,

  'datasets:alias:create': allow,
  'datasets:alias:delete': allow,
  'datasets:alias:link': allow,
  'datasets:alias:unlink': allow,
  'datasets:copy': allow,
  'datasets:create': allow,
  'datasets:delete': allow,
  'datasets:embeddings:disable': allow,
  'datasets:embeddings:enable': allow,
  'datasets:embeddings:status': allow,
  // Writes dataset contents and assets to the local filesystem.
  'datasets:export': deny,
  // Reads import data from the local filesystem and may replace documents.
  'datasets:import': deny,
  'datasets:list': allow,
  'datasets:visibility:get': allow,
  'datasets:visibility:set': allow,

  // Inspects local project files and can print authentication secrets.
  debug: deny,

  // Reads, builds, and deploys a local Studio project.
  deploy: deny,

  // Loads a local Studio project and starts a development server.
  dev: deny,

  // Opens a browser on the machine running the MCP server.
  'docs:browse': deny,
  // --web opens a browser on the machine running the MCP server.
  'docs:read': conditionalDenyFlags('web'),
  'docs:search': allow,

  // Reads and executes local project configuration for diagnostics.
  doctor: deny,

  // Reads document input from disk or launches a local editor.
  'documents:create': deny,
  'documents:delete': allow,
  'documents:get': allow,
  'documents:query': allow,
  // Loads a local Studio schema to validate documents.
  'documents:validate': deny,

  // Executes arbitrary code in the local Studio context.
  exec: deny,

  // Loads a local schema and deploys a GraphQL API.
  'graphql:deploy': deny,
  'graphql:list': allow,
  // --api loads GraphQL definitions from the local project; explicit project/dataset flags are safe.
  'graphql:undeploy': conditionalDenyFlags('api'),

  'hooks:attempt': allow,
  'hooks:create': allow,
  'hooks:delete': allow,
  'hooks:list': allow,
  'hooks:logs': allow,

  // Creates or modifies a local project and may install dependencies.
  init: deny,

  // Installs packages into the local project.
  install: deny,

  // Opens a browser on the machine running the MCP server.
  learn: deny,

  // Performs an authentication flow.
  login: deny,

  // Performs an authentication operation and clears local credentials.
  logout: deny,

  // Reads local project configuration and opens a browser.
  manage: deny,

  // Loads local Studio configuration and writes manifest files.
  'manifest:extract': deny,

  // Reads and writes local MCP client configuration.
  'mcp:configure': deny,

  // Writes an aspect definition to the local filesystem.
  'media:create-aspect': deny,
  'media:delete-aspect': allow,
  // Reads a local aspect definition before deploying it.
  'media:deploy-aspect': deny,
  // Writes media assets to the local filesystem.
  'media:export': deny,
  // Reads media assets from the local filesystem.
  'media:import': deny,

  // Creates migration source files in the local project.
  'migrations:create': deny,
  // Reads and loads migration definitions from the local project.
  'migrations:list': deny,
  // Executes local migration code that may perform arbitrary document mutations.
  'migrations:run': deny,

  // --web opens a browser on the machine running the MCP server.
  'openapi:get': conditionalDenyFlags('web'),
  'openapi:list': conditionalDenyFlags('web'),

  'organizations:create': allow,
  'organizations:delete': allow,
  'organizations:get': allow,
  'organizations:list': allow,
  'organizations:update': allow,

  // Serves a local production build.
  preview: deny,

  'projects:create': allow,
  'projects:list': allow,

  // Loads the local Studio configuration to resolve the datasets containing each schema.
  'schemas:delete': deny,
  // Loads local schema files before deploying them.
  'schemas:deploy': deny,
  // Loads local Studio configuration and writes an extracted schema to disk.
  'schemas:extract': deny,
  // Requires a local project and loads its schema configuration.
  'schemas:list': deny,
  // Loads and executes a local Studio schema.
  'schemas:validate': deny,

  // Installs skills into local editor configuration directories.
  'skills:install': deny,

  // Changes account telemetry preferences and mutates local cached configuration.
  'telemetry:disable': deny,
  // Changes account telemetry preferences and mutates local cached configuration.
  'telemetry:enable': deny,
  'telemetry:status': allow,

  // Creates authentication credentials.
  'tokens:create': deny,
  // Deletes authentication credentials.
  'tokens:delete': deny,
  // Exposes authentication credential metadata.
  'tokens:list': deny,

  // Loads local CLI and workbench configuration to identify the deployed Studio or application.
  undeploy: deny,

  // Grants a user access to a project.
  'users:invite': deny,
  'users:list': allow,

  // Reads the local project and installed package tree.
  versions: deny,
}

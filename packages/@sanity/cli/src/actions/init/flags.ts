/**
 * POJO flag and arg definitions for the `sanity init` command.
 *
 * These are plain objects with ZERO imports from `@oclif/core` so they can be
 * used by `create-sanity`'s standalone entry point without pulling in the
 * entire oclif dependency tree.
 *
 * The InitCommand converts them to oclif format via `toOclifFlags`/`toOclifArgs`.
 */

export interface FlagDef {
  // Only 'boolean' and 'string' are supported because these definitions must
  // work with both oclif (via toOclifFlags) and node:util parseArgs (in
  // create-sanity's standalone entry point). parseArgs only supports these two
  // types. If a new type is ever needed, both consumers must be updated.
  type: 'boolean' | 'string'

  aliases?: string[]
  allowNo?: boolean
  default?: boolean | string
  deprecated?: boolean | {message?: string; version?: string}
  description?: string
  exclusive?: string[]
  helpGroup?: string
  helpLabel?: string
  helpValue?: string
  hidden?: boolean
  options?: string[]
  short?: string
}

export interface ArgDef {
  type: 'string'

  description?: string
  hidden?: boolean
}

export const initFlagDefs = {
  'auto-updates': {
    allowNo: true,
    default: true,
    description: 'Enable auto updates of studio versions',
    exclusive: ['bare'],
    type: 'boolean',
  },
  bare: {
    description:
      'Skip the Studio initialization and only print the selected project ID and dataset name to stdout',
    type: 'boolean',
  },
  coupon: {
    description:
      'Optionally select a coupon for a new project (cannot be used with --project-plan)',
    exclusive: ['project-plan'],
    helpValue: '<code>',
    type: 'string',
  },
  'create-project': {
    deprecated: {message: 'Use --project-name instead'},
    description: 'Create a new project with the given name',
    helpValue: '<name>',
    hidden: true,
    type: 'string',
  },
  dataset: {
    description: 'Dataset name for the studio',
    exclusive: ['dataset-default'],
    helpValue: '<name>',
    type: 'string',
  },
  'dataset-default': {
    description: 'Set up a project with a public dataset named "production"',
    type: 'boolean',
  },
  env: {
    description: 'Write environment variables to file',
    exclusive: ['bare'],
    helpValue: '<filename>',
    type: 'string',
  },
  git: {
    default: undefined,
    description: 'Specify a commit message for initial commit, or disable git init',
    exclusive: ['bare'],
    // oclif doesn't indent correctly with custom help labels, thus leading space :/
    helpLabel: '    --[no-]git',
    helpValue: '<message>',
    type: 'string',
  },
  'import-dataset': {
    allowNo: true,
    default: undefined,
    description: 'Import template sample dataset',
    type: 'boolean',
  },
  mcp: {
    allowNo: true,
    default: true,
    description: 'Enable AI editor integration (MCP) setup',
    type: 'boolean',
  },
  'nextjs-add-config-files': {
    allowNo: true,
    default: undefined,
    description: 'Add config files to Next.js project',
    helpGroup: 'Next.js',
    type: 'boolean',
  },
  'nextjs-append-env': {
    allowNo: true,
    default: undefined,
    description: 'Append project ID and dataset to .env file',
    helpGroup: 'Next.js',
    type: 'boolean',
  },
  'nextjs-embed-studio': {
    allowNo: true,
    default: undefined,
    description: 'Embed the Studio in Next.js application',
    helpGroup: 'Next.js',
    type: 'boolean',
  },
  // oclif doesn't support a boolean/string flag combination, but listing both a
  // `--git` and a `--no-git` flag in help breaks conventions, so we hide this one,
  // but use it to "combine" the two in the actual logic.
  'no-git': {
    description: 'Disable git initialization',
    exclusive: ['git'],
    hidden: true,
    type: 'boolean',
  },
  organization: {
    description: 'Organization ID to use for the project',
    helpValue: '<id>',
    type: 'string',
  },
  'output-path': {
    description: 'Path to write studio project to',
    exclusive: ['bare'],
    helpValue: '<path>',
    type: 'string',
  },
  'overwrite-files': {
    allowNo: true,
    default: undefined,
    description: 'Overwrite existing files',
    type: 'boolean',
  },
  'package-manager': {
    description: 'Specify which package manager to use [allowed: npm, yarn, pnpm]',
    exclusive: ['bare'],
    helpValue: '<manager>',
    options: ['npm', 'yarn', 'pnpm'],
    type: 'string',
  },
  project: {
    aliases: ['project-id'],
    description: 'Project ID to use for the studio',
    exclusive: ['create-project', 'project-name'],
    helpValue: '<id>',
    type: 'string',
  },
  'project-name': {
    description: 'Create a new project with the given name',
    exclusive: ['project', 'create-project'],
    helpValue: '<name>',
    type: 'string',
  },
  'project-plan': {
    description: 'Optionally select a plan for a new project',
    helpValue: '<name>',
    type: 'string',
  },
  provider: {
    description: 'Login provider to use',
    helpValue: '<provider>',
    type: 'string',
  },
  quickstart: {
    deprecated: true,
    description:
      'Used for initializing a project from a server schema that is saved in the Journey API',
    hidden: true,
    type: 'boolean',
  },
  reconfigure: {
    deprecated: {
      message: 'This flag is no longer supported',
      version: '3.0.0',
    },
    description: 'Reconfigure an existing project',
    hidden: true,
    type: 'boolean',
  },
  template: {
    description: 'Project template to use [default: "clean"]',
    exclusive: ['bare'],
    helpValue: '<template>',
    type: 'string',
  },
  // Porting over a beta flag
  // Oclif doesn't seem to support something in beta so hiding for now
  'template-token': {
    description: 'Used for accessing private GitHub repo templates',
    hidden: true,
    type: 'string',
  },
  typescript: {
    allowNo: true,
    default: undefined,
    description: 'Enable TypeScript support',
    exclusive: ['bare'],
    type: 'boolean',
  },
  visibility: {
    description: 'Visibility mode for dataset',
    helpValue: '<mode>',
    options: ['public', 'private'],
    type: 'string',
  },
  yes: {
    default: false,
    description:
      'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    short: 'y',
    type: 'boolean',
  },
} satisfies Record<string, FlagDef>

export const initArgDefs = {
  type: {
    hidden: true,
    type: 'string' as const,
  },
} satisfies Record<string, ArgDef>

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
    type: 'boolean',
    allowNo: true,
    default: true,
    description: 'Enable auto updates of studio versions',
    exclusive: ['bare'],
  },
  bare: {
    type: 'boolean',
    description:
      'Skip the Studio initialization and only print the selected project ID and dataset name to stdout',
  },
  coupon: {
    type: 'string',
    description:
      'Optionally select a coupon for a new project (cannot be used with --project-plan)',
    exclusive: ['project-plan'],
    helpValue: '<code>',
  },
  'create-project': {
    type: 'string',
    deprecated: {message: 'Use --project-name instead'},
    description: 'Create a new project with the given name',
    helpValue: '<name>',
    hidden: true,
  },
  dataset: {
    type: 'string',
    description: 'Dataset name for the studio',
    exclusive: ['dataset-default'],
    helpValue: '<name>',
  },
  'dataset-default': {
    type: 'boolean',
    description: 'Set up a project with a public dataset named "production"',
  },
  env: {
    type: 'string',
    description: 'Write environment variables to file',
    exclusive: ['bare'],
    helpValue: '<filename>',
  },
  'from-create': {
    type: 'boolean',
    description: 'Internal flag to indicate that the command is run from create-sanity',
    hidden: true,
  },
  git: {
    type: 'string',
    default: undefined,
    description: 'Specify a commit message for initial commit, or disable git init',
    exclusive: ['bare'],
    // oclif doesn't indent correctly with custom help labels, thus leading space :/
    helpLabel: '    --[no-]git',
    helpValue: '<message>',
  },
  'import-dataset': {
    type: 'boolean',
    allowNo: true,
    default: undefined,
    description: 'Import template sample dataset',
  },
  mcp: {
    type: 'boolean',
    allowNo: true,
    default: true,
    description: 'Enable AI editor integration (MCP) setup',
  },
  'nextjs-add-config-files': {
    type: 'boolean',
    allowNo: true,
    default: undefined,
    description: 'Add config files to Next.js project',
    helpGroup: 'Next.js',
  },
  'nextjs-append-env': {
    type: 'boolean',
    allowNo: true,
    default: undefined,
    description: 'Append project ID and dataset to .env file',
    helpGroup: 'Next.js',
  },
  'nextjs-embed-studio': {
    type: 'boolean',
    allowNo: true,
    default: undefined,
    description: 'Embed the Studio in Next.js application',
    helpGroup: 'Next.js',
  },
  // oclif doesn't support a boolean/string flag combination, but listing both a
  // `--git` and a `--no-git` flag in help breaks conventions, so we hide this one,
  // but use it to "combine" the two in the actual logic.
  'no-git': {
    type: 'boolean',
    description: 'Disable git initialization',
    exclusive: ['git'],
    hidden: true,
  },
  organization: {
    type: 'string',
    description: 'Organization ID to use for the project',
    helpValue: '<id>',
  },
  'output-path': {
    type: 'string',
    description: 'Path to write studio project to',
    exclusive: ['bare'],
    helpValue: '<path>',
  },
  'overwrite-files': {
    type: 'boolean',
    allowNo: true,
    default: undefined,
    description: 'Overwrite existing files',
  },
  'package-manager': {
    type: 'string',
    description: 'Specify which package manager to use [allowed: npm, yarn, pnpm]',
    exclusive: ['bare'],
    helpValue: '<manager>',
    options: ['npm', 'yarn', 'pnpm'],
  },
  project: {
    type: 'string',
    aliases: ['project-id'],
    description: 'Project ID to use for the studio',
    exclusive: ['create-project', 'project-name'],
    helpValue: '<id>',
  },
  'project-name': {
    type: 'string',
    description: 'Create a new project with the given name',
    exclusive: ['project', 'create-project'],
    helpValue: '<name>',
  },
  'project-plan': {
    type: 'string',
    description: 'Optionally select a plan for a new project',
    helpValue: '<name>',
  },
  provider: {
    type: 'string',
    description: 'Login provider to use',
    helpValue: '<provider>',
  },
  quickstart: {
    type: 'boolean',
    deprecated: true,
    description:
      'Used for initializing a project from a server schema that is saved in the Journey API',
    hidden: true,
  },
  reconfigure: {
    type: 'boolean',
    deprecated: {
      message: 'This flag is no longer supported',
      version: '3.0.0',
    },
    description: 'Reconfigure an existing project',
    hidden: true,
  },
  template: {
    type: 'string',
    description: 'Project template to use [default: "clean"]',
    exclusive: ['bare'],
    helpValue: '<template>',
  },
  // Porting over a beta flag
  // Oclif doesn't seem to support something in beta so hiding for now
  'template-token': {
    type: 'string',
    description: 'Used for accessing private GitHub repo templates',
    hidden: true,
  },
  typescript: {
    type: 'boolean',
    allowNo: true,
    default: undefined,
    description: 'Enable TypeScript support',
    exclusive: ['bare'],
  },
  visibility: {
    type: 'string',
    description: 'Visibility mode for dataset',
    helpValue: '<mode>',
    options: ['public', 'private'],
  },
  yes: {
    type: 'boolean',
    default: false,
    description:
      'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    short: 'y',
  },
} satisfies Record<string, FlagDef>

export type InitFlagName = keyof typeof initFlagDefs

export const initArgDefs = {
  type: {
    type: 'string' as const,
    hidden: true,
  },
} satisfies Record<string, ArgDef>

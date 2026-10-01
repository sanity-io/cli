/** `npm create sanity@latest`, or the equivalent for the package manager that ran us */
export function createCommand(userAgent = process.env.npm_config_user_agent ?? ''): string {
  if (userAgent.includes('pnpm')) return 'pnpm create sanity@latest'
  if (userAgent.includes('yarn')) return 'yarn create sanity'
  if (userAgent.includes('bun')) return 'bun create sanity@latest'
  return 'npm create sanity@latest'
}

const flags: [string, string][] = [
  ['--project <id>', 'Project ID to use for the studio'],
  ['--project-name <name>', 'Create a new project with the given name'],
  [
    '--organization <id>',
    'Organization ID to use for the project (required for unattended project creation)',
  ],
  ['--dataset <name>', 'Dataset name for the studio'],
  ['--dataset-default', 'Set up a project with a public dataset named "production"'],
  ['--visibility <mode>', 'Visibility mode for dataset (public, private)'],
  ['--output-path <path>', 'Path to write studio project to'],
  ['--template <template>', 'Project template to use [default: "clean"]'],
  ['--[no-]typescript', 'Enable TypeScript support'],
  [
    '--package-manager <manager>',
    'Specify which package manager to use [allowed: npm, yarn, pnpm]',
  ],
  ['--[no-]install', 'Install dependencies after scaffolding'],
  ['--[no-]git <message>', 'Specify a commit message for initial commit, or disable git init'],
  ['--[no-]import-dataset', 'Import template sample dataset'],
  ['--[no-]auto-updates', 'Enable auto updates of studio versions'],
  ['--[no-]mcp', 'Enable AI editor integration (MCP) setup'],
  ['--[no-]skills', 'Install Sanity agent skills globally for detected AI editors'],
  ['--[no-]overwrite-files', 'Overwrite existing files'],
  ['--provider <provider>', 'Login provider to use'],
  ['--coupon <code>', 'Optionally select a coupon for a new project'],
  ['--project-plan <name>', 'Optionally select a plan for a new project'],
  ['--env <filename>', 'Write environment variables to file'],
  [
    '--bare',
    'Skip the Studio initialization and only print the selected project ID and dataset name',
  ],
  ['--[no-]nextjs-add-config-files', 'Add config files to Next.js project'],
  ['--[no-]nextjs-append-env', 'Append project ID and dataset to .env file'],
  ['--[no-]nextjs-embed-studio', 'Embed the Studio in Next.js application'],
  ['--json', 'Format output as json'],
  [
    '-y, --yes',
    'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
  ],
  ['-h, --help', 'Show this help'],
]

export function helpText(): string {
  const command = createCommand()
  const width = Math.max(...flags.map(([flag]) => flag.length))
  return [
    'Initialize a new Sanity Studio, project and/or app (the same setup as `sanity init`)',
    '',
    'USAGE',
    `  $ ${command} [-- FLAGS]`,
    '',
    'FLAGS',
    ...flags.map(([flag, description]) => `  ${flag.padEnd(width)}  ${description}`),
    '',
    'EXAMPLES',
    `  $ ${command}`,
    `  $ ${command} -- --dataset-default`,
    `  $ ${command} -- -y --project abc123 --dataset production --output-path ~/myproj`,
    `  $ ${command} -- -y --project abc123 --dataset staging --template moviedb --output-path .`,
    '',
  ].join('\n')
}

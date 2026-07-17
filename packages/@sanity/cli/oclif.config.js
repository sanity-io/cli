export default {
  bin: 'sanity',
  commands: './dist/commands',
  dirname: 'sanity',
  helpClass: './dist/SanityHelp',
  hooks: {
    command_not_found: ['./dist/hooks/commandNotFound/topicAliases.js'],
    init: ['./dist/hooks/init/checkForUpdates.js'],
    prerun: [
      './dist/hooks/prerun/injectEnvVariables.js',
      './dist/hooks/prerun/setupTelemetry.js',
      './dist/hooks/prerun/warnings.js',
    ],
  },
  // Note: do not add '@sanity/migrate' here. The `migrations` commands now ship
  // natively (see commands/migrations/); re-adding the plugin would register
  // duplicate command ids.
  plugins: ['@oclif/plugin-help', '@sanity/runtime-cli', '@sanity/codegen'],
  topics: {
    backups: {description: 'Manage dataset backups'},
    cors: {description: 'Manage CORS origins for your project'},
    datasets: {description: 'Manage datasets in your project'},
    docs: {description: 'Browse and search Sanity documentation'},
    documents: {description: 'Manage documents in a dataset'},
    graphql: {description: 'Manage GraphQL APIs for your project'},
    hooks: {description: 'Manage webhooks for your project'},
    manifest: {description: 'Extract studio configuration as JSON manifests'},
    mcp: {description: 'Configure Sanity MCP server for AI agents'},
    media: {description: 'Manage media assets and aspect definitions'},
    migrations: {description: 'Run and manage content migrations'},
    openapi: {description: 'Manage OpenAPI specifications'},
    organizations: {description: 'Manage your organizations'},
    projects: {description: 'Manage Sanity projects'},
    schemas: {description: 'Manage and validate schemas'},
    skills: {description: 'Install Sanity agent skills for AI agents'},
    telemetry: {description: 'Manage telemetry consent'},
    tokens: {description: 'Manage API tokens for your project'},
    users: {description: 'Manage project users and invitations'},
  },
  topicSeparator: ' ',
}

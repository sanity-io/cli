export default {
  bin: 'sanity',
  commands: './dist/commands',
  dirname: 'sanity',
  helpClass: './dist/SanityHelp',
  hooks: {
    prerun: ['./dist/hooks/prerun/setupTelemetry.js', './dist/hooks/prerun/injectEnvVariables.js'],
  },
  plugins: [
    '@oclif/plugin-help',
    '@oclif/plugin-not-found',
    '@sanity/runtime-cli',
    '@sanity/migrate',
    '@sanity/codegen',
  ],
  topicSeparator: ' ',
}

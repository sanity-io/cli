export default {
  bin: 'sanity',
  commands: './dist/commands',
  dirname: 'sanity',
  helpClass: './dist/SanityHelp',
  hooks: {
    init: ['./dist/hooks/init/checkForUpdates.js'],
    prerun: [
      './dist/hooks/prerun/injectEnvVariables.js',
      './dist/hooks/prerun/setupTelemetry.js',
      './dist/hooks/prerun/warnings.js',
    ],
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

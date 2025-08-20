export default {
  bin: 'sanity',
  commands: './dist/commands',
  dirname: 'sanity',
  helpClass: './dist/SanityHelp',
  hooks: {
    postrun: ['./dist/hooks/postrun/completeTelemetry.js'],
    prerun: ['./dist/hooks/prerun/setupTelemetry.js'],
  },
  plugins: [
    '@oclif/plugin-help',
    '@oclif/plugin-not-found',
    '@sanity/runtime-cli',
    '@sanity/migrate',
  ],
  topicSeparator: ' ',
}

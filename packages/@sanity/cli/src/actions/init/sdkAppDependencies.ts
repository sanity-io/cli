export const sdkAppDependencies = {
  dependencies: {
    // TODO: change these to 'latest' once SDK v3 is published
    '@sanity/sdk': '^3.0.0-rc.0',
    '@sanity/sdk-react': '^3.0.0-rc.0',
    react: '^19.2.4',
    'react-dom': '^19.2.4',
  },

  devDependencies: {
    '@sanity/eslint-config-studio': 'latest',
    '@types/react': '^19.2.14',
    eslint: '^9.28',
    prettier: '^3.5',
    sanity: 'latest',
    typescript: '^5.8', // Peer dependency of eslint-config-studio (implicitly)
  },
}

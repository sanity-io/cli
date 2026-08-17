export const sdkAppDependencies = {
  dependencies: {
    // change these to 'latest' as in studioDependencies.ts once SDK v3 is released
    '@sanity/sdk': '^2',
    '@sanity/sdk-react': '^2',
    react: '^19.2.4',
    'react-dom': '^19.2.4',
  },

  devDependencies: {
    // Pinned to a major range rather than `latest`: this package declares a peer dependency on
    // `eslint`, so a floating specifier lets a new major (with a new eslint peer range) break
    // `sanity init` with ERESOLVE. Bump this together with `eslint` below.
    '@sanity/eslint-config-studio': '^6',
    '@types/react': '^19.2.14',
    eslint: '^9.28',
    prettier: '^3.5',
    sanity: 'latest',
    typescript: '^5.8', // Peer dependency of eslint-config-studio (implicitly)
  },
}

export const sdkAppDependencies = {
  dependencies: {
    '@sanity/sdk': 'latest',
    '@sanity/sdk-react': 'latest',
    react: '^19.2.4',
    'react-dom': '^19.2.4',
  },

  devDependencies: {
    '@sanity/eslint-config-studio': '^7',
    '@types/react': '^19.2.14',
    eslint: '^10.8.1',
    prettier: '^3.5',
    sanity: 'latest',
    // typescript-eslint (via eslint-config-studio) only supports TypeScript up to 6.0.x
    typescript: '~6.0',
  },
}

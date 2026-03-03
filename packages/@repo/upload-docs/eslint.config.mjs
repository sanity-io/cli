import eslintConfig from '@sanity/eslint-config-cli'

export default [
  ...eslintConfig,
  {
    rules: {
      'no-console': 'off',
    },
  },
]

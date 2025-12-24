import eslintConfig from '@sanity/eslint-config-cli'

export default [...eslintConfig, {rules: {'@typescript-eslint/no-explicit-any': 'warn'}}]

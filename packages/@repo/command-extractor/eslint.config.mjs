import eslintConfig from '@repo/eslint-config'

export default [...eslintConfig, {rules: {'@typescript-eslint/no-explicit-any': 'warn'}}]
